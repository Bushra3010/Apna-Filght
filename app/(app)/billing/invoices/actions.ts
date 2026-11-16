'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import { computeLine } from '@/lib/gst'
import { BILL_TYPES, BILL_TYPE_KEYS, LINE_COLUMNS, type BillType } from '@/lib/invoice'
import type { FormState } from '@/components/form'

const money = z.string().refine((v) => v.trim() === '' || Number.isFinite(Number(v.replace(/,/g, ''))), 'Amounts must be numbers')
const nonNeg = money.refine((v) => toPaise(v) >= 0, 'Amounts cannot be negative')
const optDate = z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Invalid date')
const uuidOrEmpty = z.union([z.literal(''), z.string().uuid()])

const Line = z.object({
  service: z.enum(['flight', 'hotel', 'visa', 'insurance', 'train', 'bus', 'taxi', 'misc', 'tour', 'commission']),
  pax_name: z.string().trim(),
  pax_type: z.enum(['adult', 'child', 'infant']),
  fields: z.record(z.string(), z.string()),
  basic: nonNeg,
  xt: nonNeg,
  service_fee: nonNeg,
  other_charges: nonNeg,
  discount: nonNeg,
  gst_rate: z.enum(['0', '5', '12', '18', '28']),
  gst_on: z.enum(['service', 'full']),
  supplier_ledger_id: uuidOrEmpty,
  supplier_invoice_no: z.string().trim(),
  purchase_gross: nonNeg,
  purchase_gst: nonNeg,
  commission: nonNeg,
  tds: nonNeg,
})

const Invoice = z.object({
  id: z.string().optional(),
  doc_kind: z.enum(['invoice', 'proforma']).default('invoice'),
  quotation_id: z.string().optional(),
  bill_type: z.enum(BILL_TYPE_KEYS as [BillType, ...BillType[]]),
  invoice_date: z.iso.date('Choose the invoice date'),
  due_date: optDate,
  party_ledger_id: z.string().uuid('Choose the client'),
  place_of_supply_state_id: z.string().uuid('Choose the place of supply'),
  booked_by_id: uuidOrEmpty,
  contact_phone: z.string().trim(),
  lead_id: z.string(),
  notes: z.string().trim(),
  lines: z.array(Line).min(1, 'Add at least one line'),
})

const nul = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : v.trim())
const NAMED = new Set(['flight', 'hotel', 'visa', 'insurance', 'train', 'bus'])

export async function saveInvoice(_: FormState, form: FormData): Promise<FormState> {
  let json: unknown
  try {
    json = JSON.parse(String(form.get('payload')))
  } catch {
    return { error: 'Could not read the form. Please reload and try again.' }
  }
  const parsed = Invoice.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const lineNo = issue.path[0] === 'lines' && typeof issue.path[1] === 'number' ? `Line ${issue.path[1] + 1}: ` : ''
    return { error: lineNo + issue.message }
  }
  const inv = parsed.data
  const cfg = BILL_TYPES[inv.bill_type]
  const { supabase, org } = await getContext()

  // Recompute every figure on the server; the client's numbers are only a preview.
  const { data: o } = await supabase.from('orgs').select('state_id').eq('id', org.id).single()
  const interstate = !!o?.state_id && o.state_id !== inv.place_of_supply_state_id

  const lines = []
  for (const [i, l] of inv.lines.entries()) {
    const at = `Line ${i + 1}: `
    if (!cfg.services.includes(l.service)) return { error: `${at}service does not match a ${cfg.label} invoice` }
    if (NAMED.has(l.service) && !l.pax_name) return { error: `${at}enter the ${cfg.paxLabel.toLowerCase()}` }
    for (const f of cfg.fields) {
      if (f.required && !nul(l.fields[f.key])) return { error: `${at}enter the ${f.label.toLowerCase()}` }
      if (f.type === 'date' && l.fields[f.key] && Number.isNaN(Date.parse(l.fields[f.key]))) return { error: `${at}${f.label} is not a valid date` }
      if (f.type === 'airline' && l.fields[f.key] && !z.string().uuid().safeParse(l.fields[f.key]).success) return { error: `${at}choose the airline again` }
    }
    const amounts = {
      basic: toPaise(l.basic),
      xt: cfg.amounts.xt ? toPaise(l.xt) : 0,
      service_fee: toPaise(l.service_fee),
      other_charges: toPaise(l.other_charges),
      discount: toPaise(l.discount),
      gst_rate: cfg.noGst ? 0 : Number(l.gst_rate),
      gst_on: l.gst_on,
      purchase_gross: cfg.purchase ? toPaise(l.purchase_gross) : 0,
      purchase_gst: cfg.purchase ? toPaise(l.purchase_gst) : 0,
      commission: cfg.purchase ? toPaise(l.commission) : 0,
      tds: cfg.purchase ? toPaise(l.tds) : 0,
    }
    const hasPurchase = amounts.purchase_gross || amounts.commission || amounts.tds
    if (hasPurchase && !l.supplier_ledger_id) return { error: `${at}choose the supplier for the purchase amounts` }
    if (amounts.purchase_gst > amounts.purchase_gross) return { error: `${at}input GST cannot exceed the purchase amount` }
    const t = computeLine(amounts, interstate)
    if (t.net_sale <= 0) return { error: `${at}the sale amount must be more than zero` }

    const cols: Record<string, string | null> = {}
    const details: Record<string, string> = {}
    for (const f of cfg.fields) {
      const v = nul(l.fields[f.key])
      const val = v && f.upper ? v.toUpperCase() : v
      if ((LINE_COLUMNS as readonly string[]).includes(f.key)) cols[f.key] = val
      else if (val) details[f.key] = val
    }
    const travel = cols.travel_date, ret = cols.return_date
    if (travel && ret && ret < travel) return { error: `${at}the end date is before the start date` }

    lines.push({
      service: l.service,
      pax_name: nul(l.pax_name)?.toUpperCase() ?? null,
      pax_type: NAMED.has(l.service) ? l.pax_type : null,
      ...cols,
      details: { ...details, gst_on: l.gst_on },
      ...amounts,
      taxable: t.taxable,
      cgst: t.cgst,
      sgst: t.sgst,
      igst: t.igst,
      net_sale: t.net_sale,
      supplier_ledger_id: cfg.purchase ? nul(l.supplier_ledger_id) : null,
      supplier_invoice_no: cfg.purchase ? nul(l.supplier_invoice_no) : null,
      net_purchase: t.net_purchase,
    })
  }

  const header = {
    id: inv.id,
    doc_kind: inv.doc_kind,
    bill_type: inv.bill_type,
    invoice_date: inv.invoice_date,
    due_date: nul(inv.due_date),
    party_ledger_id: inv.party_ledger_id,
    place_of_supply_state_id: inv.place_of_supply_state_id,
    booked_by_id: nul(inv.booked_by_id),
    contact_phone: nul(inv.contact_phone),
    lead_id: nul(inv.lead_id),
    notes: nul(inv.notes),
  }
  const { data: id, error } = await supabase.rpc('save_invoice', { p_org: org.id, p_header: header, p_lines: lines, p_post: true })
  if (error) return { error: friendlyError(error.message) }

  if (inv.quotation_id && !inv.id) {
    const { count } = await supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('id', inv.quotation_id).eq('org_id', org.id)
    if (count) await supabase.from('invoices').update({ quotation_id: inv.quotation_id }).eq('id', id).eq('org_id', org.id)
  }
  if (header.lead_id && !inv.id && inv.doc_kind === 'invoice') {
    await supabase.from('leads').update({ status: 'booked' }).eq('id', header.lead_id).eq('org_id', org.id)
  }
  revalidatePath('/billing/invoices')
  revalidatePath('/billing/proformas')
  revalidatePath('/dashboard')
  redirect(`/billing/invoices/${id}`)
}

export async function convertProforma(form: FormData) {
  const id = String(form.get('id'))
  const date = String(form.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  const { supabase, org } = await getContext()
  const { data: inv, error } = await supabase.rpc('convert_proforma', { p_org: org.id, p_proforma: id, p_date: date })
  if (error) redirect(`/billing/invoices/${id}?error=${encodeURIComponent(friendlyError(error.message))}`)
  const { data: pf } = await supabase.from('invoices').select('lead_id').eq('id', id).single()
  if (pf?.lead_id) await supabase.from('leads').update({ status: 'booked' }).eq('id', pf.lead_id).eq('org_id', org.id)
  revalidatePath('/billing/proformas')
  revalidatePath('/billing/invoices')
  redirect(`/billing/invoices/${inv}`)
}
