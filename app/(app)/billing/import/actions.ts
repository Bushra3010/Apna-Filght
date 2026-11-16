'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { todayIST } from '@/lib/dates'
import { computeLine, type LineAmounts } from '@/lib/gst'
import { toPaise } from '@/lib/money'
import { byName, date, MAX_ROWS, money, recordBatch, saveMapping, type ImportResult, type RowResult } from '@/lib/import/server'

const Payload = z.object({
  file_name: z.string(),
  mapping_name: z.string(),
  mapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.string())).max(MAX_ROWS, `At most ${MAX_ROWS} rows per file`),
})
const Defaults = z.object({
  bill_type: z.enum(['domestic', 'international']),
  invoice_date: z.string(),
  client_ledger_id: z.string(),
  supplier_ledger_id: z.string(),
  gst_rate: z.enum(['0', '5', '12', '18', '28']),
  group_by: z.enum(['pnr', 'row']),
  create_missing: z.preprocess((v) => v === 'on', z.boolean()),
})

type Line = Record<string, unknown>
type Prepared = { n: number; raw: Record<string, string>; errors: string[]; skip?: string; key: string; clientId?: string; clientName: string; clientNew?: boolean; invoiceDate: string; line: Line; label: string; total: number }

export async function importBilling(_: ImportResult, form: FormData): Promise<ImportResult> {
  const mode = form.get('mode') === 'commit' ? 'commit' : 'preview'
  let payload: z.infer<typeof Payload>
  try {
    const p = Payload.safeParse(JSON.parse(String(form.get('payload'))))
    if (!p.success) return { error: p.error.issues[0].message }
    payload = p.data
  } catch {
    return { error: 'Could not read the file data. Please choose the file again.' }
  }
  const d = Defaults.safeParse(Object.fromEntries(form))
  if (!d.success) return { error: d.error.issues[0].message }
  const def = d.data
  if (!payload.rows.length) return { error: 'The file has no rows' }

  const { supabase, org, member } = await getContext()
  const [{ data: ledgers }, { data: airlines }, { data: o }] = await Promise.all([
    supabase.from('ledgers').select('id, name, kind, state_id').eq('org_id', org.id).in('kind', ['customer', 'supplier']),
    supabase.from('airlines').select('id, code, name'),
    supabase.from('orgs').select('state_id').eq('id', org.id).single(),
  ])
  const customers = (ledgers ?? []).filter((l) => l.kind === 'customer')
  const findClient = byName(customers)
  const findSupplier = byName((ledgers ?? []).filter((l) => l.kind === 'supplier'))
  const airlineBy = (v: string | undefined) => {
    const s = (v ?? '').trim().toUpperCase()
    if (!s) return undefined
    return (airlines ?? []).find((a) => a.code.toUpperCase() === s) ?? (airlines ?? []).find((a) => a.name.toUpperCase() === s)
  }
  const defaultClient = customers.find((c) => c.id === def.client_ledger_id)
  const defaultSupplierId = (ledgers ?? []).find((l) => l.id === def.supplier_ledger_id && l.kind === 'supplier')?.id
  const fallbackDate = parseDateOr(def.invoice_date) ?? todayIST()

  // tickets already invoiced (re-importing the same file is safe)
  const tickets = [...new Set(payload.rows.map((r) => (r.ticket_no ?? '').trim()).filter(Boolean))]
  const invoiced = new Set<string>()
  for (let i = 0; i < tickets.length; i += 200) {
    const { data } = await supabase.from('invoice_lines').select('ticket_no, invoices!inner(doc_kind, status)').eq('org_id', org.id)
      .in('ticket_no', tickets.slice(i, i + 200)).eq('invoices.doc_kind', 'invoice').eq('invoices.status', 'posted')
    data?.forEach((x) => x.ticket_no && invoiced.add(x.ticket_no))
  }
  const seenInFile = new Set<string>()

  const prepared: Prepared[] = payload.rows.map((r, i) => {
    const errors: string[] = []
    const n = i + 1
    const basic = money(r.basic, 'Base fare', errors)
    const xt = money(r.xt, 'Taxes', errors)
    const fee = money(r.service_fee, 'Service fee', errors)
    const other = money(r.other_charges, 'Other charges', errors)
    const disc = money(r.discount, 'Discount', errors)
    const purchase = money(r.purchase_gross, 'Purchase cost', errors)
    const comm = money(r.commission, 'Commission', errors)
    const tds = money(r.tds, 'TDS', errors)
    const invoiceDate = date(r.invoice_date, 'Booking date', errors) ?? fallbackDate
    const travel = date(r.travel_date, 'Travel date', errors)
    const ret = date(r.return_date, 'Return date', errors)
    const pax = (r.pax_name ?? '').trim().toUpperCase()
    if (!pax) errors.push('Passenger name is empty')

    const clientName = (r.client ?? '').trim()
    let clientId = clientName ? findClient(clientName)?.id : defaultClient?.id
    let clientNew = false
    if (!clientId && clientName && def.create_missing) clientNew = true
    if (!clientId && !clientNew) errors.push(clientName ? `Client “${clientName}” not found (tick “Create clients that are not in Ledgers yet” or add it under Ledgers)` : 'No client: add a client column or choose a default client')
    if (clientNew) clientId = undefined

    const supplierName = (r.supplier ?? '').trim()
    const supplierId = supplierName ? findSupplier(supplierName)?.id : defaultSupplierId
    const amounts = {
      basic: toPaise(basic), xt: toPaise(xt), service_fee: toPaise(fee), other_charges: toPaise(other), discount: Math.abs(toPaise(disc)),
      gst_rate: Number(def.gst_rate), gst_on: 'service' as const,
      purchase_gross: toPaise(purchase), purchase_gst: 0, commission: toPaise(comm), tds: toPaise(tds),
    }
    if ([amounts.basic, amounts.xt, amounts.service_fee, amounts.other_charges, amounts.purchase_gross, amounts.commission, amounts.tds].some((x) => x < 0))
      errors.push('Negative amounts look like a refund: record refunds as a cancellation instead')
    if (amounts.basic + amounts.xt + amounts.service_fee + amounts.other_charges - amounts.discount <= 0) errors.push('Sale amount is zero')
    if ((amounts.purchase_gross || amounts.commission || amounts.tds) && !supplierId)
      errors.push(supplierName ? `Supplier “${supplierName}” not found under Ledgers` : 'Purchase cost given but no supplier: add a supplier column or choose a default supplier')

    const ticket = (r.ticket_no ?? '').trim()
    let skip: string | undefined
    if (ticket && invoiced.has(ticket)) skip = `Ticket ${ticket} is already invoiced`
    else if (ticket && seenInFile.has(ticket)) skip = `Ticket ${ticket} appears twice in this file`
    if (ticket) seenInFile.add(ticket)

    const pt = (r.pax_type ?? '').trim().toUpperCase()
    const line: Line = {
      service: 'flight', pax_name: pax, pax_type: pt.startsWith('C') ? 'child' : pt.startsWith('I') ? 'infant' : 'adult',
      airline_id: airlineBy(r.airline)?.id ?? null, flight_no: (r.flight_no ?? '').trim().toUpperCase() || null,
      sector: (r.sector ?? '').trim().toUpperCase() || null, travel_date: travel, return_date: ret,
      pnr: (r.pnr ?? '').trim().toUpperCase() || null, ticket_no: ticket || null,
      details: { gst_on: 'service' }, ...amounts,
      supplier_ledger_id: amounts.purchase_gross || amounts.commission || amounts.tds ? supplierId ?? null : null,
      supplier_invoice_no: (r.supplier_invoice_no ?? '').trim() || null,
    }
    const key = def.group_by === 'pnr' && line.pnr ? `${invoiceDate}|${line.pnr}` : `row${n}`
    return { n, raw: r, errors, skip, key, clientId, clientName: clientName || defaultClient?.name || '', clientNew, invoiceDate, line, label: [pax, line.pnr, ticket].filter(Boolean).join(' · '), total: 0 }
  })

  const okRows = prepared.filter((p) => !p.errors.length && !p.skip)
  const invoices = new Set(okRows.map((p) => `${p.clientId ?? p.clientName}|${p.key}`)).size
  const results: RowResult[] = prepared.map((p) => ({
    n: p.n, label: p.label,
    status: p.errors.length ? 'error' : p.skip ? 'skip' : 'ok',
    message: p.errors.length ? p.errors.join('; ') : p.skip ?? `${p.clientNew ? `New client “${p.clientName}” · ` : ''}${p.clientName}`,
  }))

  if (mode === 'preview') {
    return { mode, rows: results, summary: `${okRows.length} row(s) ready → ${invoices} invoice(s); ${prepared.filter((p) => p.skip).length} skipped; ${prepared.filter((p) => p.errors.length).length} with problems` }
  }
  if (!okRows.length) return { mode: 'preview', rows: results, error: 'Nothing to import: fix the rows marked in red' }

  // create clients that don't exist yet
  if (okRows.some((p) => p.clientNew)) {
    const { data: g } = await supabase.from('account_groups').select('id').eq('org_id', org.id).eq('system_key', 'sundry_debtors').single()
    const names = [...new Set(okRows.filter((p) => p.clientNew).map((p) => p.clientName))]
    const { data: created, error } = await supabase.from('ledgers').insert(names.map((name) => ({ org_id: org.id, group_id: g!.id, name, kind: 'customer' }))).select('id, name, state_id')
    if (error) return { error: friendlyError(error.message) }
    const find = byName(created ?? [])
    okRows.forEach((p) => { if (p.clientNew) p.clientId = find(p.clientName)?.id })
  }

  const stateOf = new Map((ledgers ?? []).map((l) => [l.id, l.state_id as string | null]))
  // one invoice per client + date + PNR (or per row)
  const groups = new Map<string, Prepared[]>()
  okRows.forEach((p) => { const k = `${p.clientId}|${p.key}`; groups.set(k, [...(groups.get(k) ?? []), p]) })
  const outcome = new Map<number, { invoice_id?: string; error?: string; no?: string }>()

  for (const rows of groups.values()) {
    const first = rows[0]
    const pos = stateOf.get(first.clientId!) ?? o?.state_id ?? null
    const inter = !!o?.state_id && !!pos && pos !== o.state_id
    const lines = rows.map((p) => {
      const t = computeLine(p.line as unknown as LineAmounts, inter)
      return { ...p.line, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, net_sale: t.net_sale, net_purchase: t.net_purchase }
    })
    const { data: id, error } = await supabase.rpc('save_invoice', {
      p_org: org.id,
      p_header: { bill_type: def.bill_type, invoice_date: first.invoiceDate, party_ledger_id: first.clientId, place_of_supply_state_id: pos, notes: `Imported from ${payload.file_name}` },
      p_lines: lines,
      p_post: true,
    })
    let no: string | undefined
    if (id) no = (await supabase.from('invoices').select('invoice_no').eq('id', id as string).single()).data?.invoice_no
    rows.forEach((p) => outcome.set(p.n, error ? { error: friendlyError(error.message) } : { invoice_id: id as string, no }))
  }

  await recordBatch(supabase, org.id, member.id, 'billing', payload.mapping_name, payload.file_name,
    prepared.map((p) => ({ n: p.n, raw: p.raw, error: p.errors.join('; ') || p.skip || outcome.get(p.n)?.error, invoice_id: outcome.get(p.n)?.invoice_id })))
  if (payload.mapping_name) {
    await saveMapping(supabase, org.id, 'billing', payload.mapping_name, payload.mapping,
      { bill_type: def.bill_type, gst_rate: def.gst_rate, group_by: def.group_by, client_ledger_id: def.client_ledger_id, supplier_ledger_id: def.supplier_ledger_id })
  }
  revalidatePath('/billing/invoices')
  revalidatePath('/billing/import')

  const done = results.map((r) => {
    const x = outcome.get(r.n)
    if (!x) return r
    return x.error ? { ...r, status: 'error' as const, message: x.error } : { ...r, message: `Invoiced on ${x.no}` }
  })
  const made = new Set([...outcome.values()].filter((x) => x.no).map((x) => x.no)).size
  return { mode, rows: done, summary: `Created ${made} invoice(s) from ${[...outcome.values()].filter((x) => x.no).length} row(s)` }
}

function parseDateOr(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
