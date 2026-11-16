'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import { computeLine } from '@/lib/gst'
import type { FormState } from '@/components/form'

const money = z.string().refine((v) => v.trim() === '' || Number.isFinite(Number(v.replace(/,/g, ''))), 'Amounts must be numbers')
const nonNeg = money.refine((v) => toPaise(v) >= 0, 'Amounts cannot be negative')
const optDate = z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Invalid date')

const Line = z.object({
  pax_name: z.string().trim().min(1, 'Each line needs a passenger name'),
  pax_type: z.enum(['adult', 'child', 'infant']),
  airline_id: z.string(),
  flight_no: z.string().trim(),
  sector: z.string().trim().toUpperCase(),
  travel_date: optDate,
  return_date: optDate,
  pnr: z.string().trim().toUpperCase(),
  ticket_no: z.string().trim(),
  basic: nonNeg,
  xt: nonNeg,
  service_fee: nonNeg,
  other_charges: nonNeg,
  discount: nonNeg,
  gst_rate: z.enum(['0', '5', '12', '18', '28']),
  supplier_ledger_id: z.string(),
  supplier_invoice_no: z.string().trim(),
  purchase_gross: nonNeg,
  purchase_gst: nonNeg,
  commission: nonNeg,
  tds: nonNeg,
})

const Invoice = z.object({
  id: z.string().optional(),
  bill_type: z.enum(['domestic', 'international']),
  invoice_date: z.iso.date('Choose the invoice date'),
  due_date: optDate,
  party_ledger_id: z.string().uuid('Choose the client'),
  place_of_supply_state_id: z.string().uuid('Choose the place of supply'),
  contact_phone: z.string().trim(),
  lead_id: z.string(),
  notes: z.string().trim(),
  lines: z.array(Line).min(1, 'Add at least one passenger line'),
})

const nul = (v: string) => (v === '' ? null : v)

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
  const { supabase, org } = await getContext()

  // Recompute every figure on the server; the client's numbers are only a preview.
  const { data: o } = await supabase.from('orgs').select('state_id').eq('id', org.id).single()
  const interstate = !!o?.state_id && o.state_id !== inv.place_of_supply_state_id

  const lines = []
  for (const [i, l] of inv.lines.entries()) {
    const amounts = {
      basic: toPaise(l.basic),
      xt: toPaise(l.xt),
      service_fee: toPaise(l.service_fee),
      other_charges: toPaise(l.other_charges),
      discount: toPaise(l.discount),
      gst_rate: Number(l.gst_rate),
      purchase_gross: toPaise(l.purchase_gross),
      purchase_gst: toPaise(l.purchase_gst),
      commission: toPaise(l.commission),
      tds: toPaise(l.tds),
    }
    const hasPurchase = amounts.purchase_gross || amounts.commission || amounts.tds
    if (hasPurchase && !l.supplier_ledger_id) return { error: `Line ${i + 1}: choose the supplier for the purchase amounts` }
    if (amounts.purchase_gst > amounts.purchase_gross) return { error: `Line ${i + 1}: input GST cannot exceed the purchase amount` }
    const t = computeLine(amounts, interstate)
    if (t.net_sale <= 0) return { error: `Line ${i + 1}: the sale amount must be more than zero` }
    lines.push({
      service: 'flight',
      pax_name: l.pax_name.toUpperCase(),
      pax_type: l.pax_type,
      airline_id: nul(l.airline_id),
      flight_no: nul(l.flight_no),
      sector: nul(l.sector),
      travel_date: nul(l.travel_date),
      return_date: nul(l.return_date),
      pnr: nul(l.pnr),
      ticket_no: nul(l.ticket_no),
      ...amounts,
      taxable: t.taxable,
      cgst: t.cgst,
      sgst: t.sgst,
      igst: t.igst,
      net_sale: t.net_sale,
      supplier_ledger_id: nul(l.supplier_ledger_id),
      supplier_invoice_no: nul(l.supplier_invoice_no),
      net_purchase: t.net_purchase,
    })
  }

  const header = {
    id: inv.id,
    bill_type: inv.bill_type,
    invoice_date: inv.invoice_date,
    due_date: nul(inv.due_date),
    party_ledger_id: inv.party_ledger_id,
    place_of_supply_state_id: inv.place_of_supply_state_id,
    contact_phone: nul(inv.contact_phone),
    lead_id: nul(inv.lead_id),
    notes: nul(inv.notes),
  }
  const { data: id, error } = await supabase.rpc('save_invoice', { p_org: org.id, p_header: header, p_lines: lines, p_post: true })
  if (error) return { error: friendlyError(error.message) }

  // a billed lead is booked
  if (header.lead_id && !inv.id) {
    await supabase.from('leads').update({ status: 'booked' }).eq('id', header.lead_id).eq('org_id', org.id)
  }
  revalidatePath('/billing/invoices')
  revalidatePath('/dashboard')
  redirect(`/billing/invoices/${id}`)
}
