'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import { computeLine, computeTax } from '@/lib/gst'
import type { FormState } from '@/components/form'

const amt = z.string().refine((v) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Amounts must be zero or more')

const CreditNote = z.object({
  invoice_id: z.string().uuid(),
  date: z.iso.date('Choose the date'),
  notes: z.string().trim(),
  charges: amt,
  charges_rate: z.enum(['0', '5', '12', '18', '28']),
  lines: z.array(
    z.object({
      line_id: z.string().uuid(),
      include: z.boolean(),
      basic: amt,
      xt: amt,
      service_fee: amt,
      other_charges: amt,
      purchase_refund: amt,
      commission: amt,
      tds: amt,
    }),
  ),
})

export async function saveCreditNote(_: FormState, form: FormData): Promise<FormState> {
  let json: unknown
  try {
    json = JSON.parse(String(form.get('payload')))
  } catch {
    return { error: 'Could not read the form. Please reload and try again.' }
  }
  const parsed = CreditNote.safeParse(json)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const cn = parsed.data
  const picked = cn.lines.filter((l) => l.include)
  if (!picked.length) return { error: 'Tick at least one line to cancel' }

  const { supabase, org } = await getContext()
  const [{ data: inv }, { data: orig }] = await Promise.all([
    supabase.from('invoices').select('id, bill_type, party_ledger_id, place_of_supply_state_id, is_interstate, doc_kind, status').eq('org_id', org.id).eq('id', cn.invoice_id).maybeSingle(),
    supabase.from('invoice_lines').select('*').eq('invoice_id', cn.invoice_id),
  ])
  if (!inv || inv.doc_kind !== 'invoice' || inv.status !== 'posted') return { error: 'Invoice not found' }
  const byId = new Map((orig ?? []).map((l) => [l.id, l]))
  const inter = inv.is_interstate as boolean

  const lines = []
  for (const p of picked) {
    const o = byId.get(p.line_id)
    if (!o) return { error: 'A line no longer exists on the invoice; reload the page' }
    const a = {
      basic: toPaise(p.basic),
      xt: toPaise(p.xt),
      service_fee: toPaise(p.service_fee),
      other_charges: toPaise(p.other_charges),
      discount: 0,
      gst_rate: Number(o.gst_rate),
      gst_on: ((o.details ?? {}) as Record<string, string>).gst_on === 'full' ? ('full' as const) : ('service' as const),
      purchase_gross: toPaise(p.purchase_refund),
      purchase_gst: 0,
      commission: toPaise(p.commission),
      tds: toPaise(p.tds),
    }
    const name = o.pax_name ?? o.description ?? 'line'
    if (a.basic > o.basic || a.xt > o.xt || a.service_fee > o.service_fee || a.other_charges > o.other_charges)
      return { error: `${name}: refund cannot be more than what was billed` }
    if (a.purchase_gross > o.purchase_gross || a.commission > o.commission || a.tds > o.tds)
      return { error: `${name}: supplier refund cannot be more than the purchase` }
    const t = computeLine(a, inter)
    lines.push({
      service: o.service, description: o.description, passenger_id: o.passenger_id, pax_name: o.pax_name, pax_type: o.pax_type,
      airline_id: o.airline_id, flight_no: o.flight_no, pnr: o.pnr, ticket_no: o.ticket_no, sector: o.sector,
      travel_date: o.travel_date, return_date: o.return_date, details: o.details,
      ...a, taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, net_sale: t.net_sale,
      group_purchase_id: o.group_purchase_id,
      supplier_ledger_id: a.purchase_gross || a.commission || a.tds ? o.supplier_ledger_id : null,
      supplier_invoice_no: o.supplier_invoice_no, net_purchase: t.net_purchase,
    })
  }

  const charges = toPaise(cn.charges)
  if (charges > 0) {
    const rate = inv.bill_type === 'bill_of_supply' ? 0 : Number(cn.charges_rate)
    const tax = computeTax(charges, rate, inter)
    lines.push({
      service: 'cancellation_charge', description: 'Cancellation charges', service_fee: -charges, taxable: -charges,
      gst_rate: rate, cgst: -tax.cgst, sgst: -tax.sgst, igst: -tax.igst,
      net_sale: -(charges + tax.cgst + tax.sgst + tax.igst),
    })
  }

  const { data: id, error } = await supabase.rpc('save_invoice', {
    p_org: org.id,
    p_header: {
      doc_kind: 'credit_note',
      bill_type: inv.bill_type,
      invoice_date: cn.date,
      party_ledger_id: inv.party_ledger_id,
      place_of_supply_state_id: inv.place_of_supply_state_id,
      ref_invoice_id: inv.id,
      notes: cn.notes || null,
    },
    p_lines: lines,
    p_post: true,
  })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/billing/invoices')
  revalidatePath('/billing/credit-notes')
  revalidatePath('/dashboard')
  redirect(`/billing/invoices/${id}`)
}
