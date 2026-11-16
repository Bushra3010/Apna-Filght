'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import type { FormState } from '@/components/form'

const money = z.string().refine((v) => v.trim() === '' || (Number.isFinite(Number(v.replace(/,/g, ''))) && Number(v.replace(/,/g, '')) >= 0), 'Prices must be zero or more')
const optDate = z.string().refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Invalid date')
const count = z.string().refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 100), 'Enter a valid number of people')

const Quote = z.object({
  id: z.string().optional(),
  quote_date: z.iso.date('Choose the quotation date'),
  lead_id: z.string(),
  party_ledger_id: z.string(),
  client_name: z.string().trim().min(2, 'Enter the client name'),
  itinerary_id: z.string(),
  route_id: z.string(),
  package_title_id: z.string(),
  meal_plan_id: z.string(),
  start_date: optDate,
  nights: count,
  adults: count.refine((v) => Number(v) >= 1, 'At least one adult'),
  children: count,
  infants: count,
  gst_rate: z.enum(['0', '5', '12', '18', '28']),
  valid_until: optDate,
  inclusions: z.string().trim(),
  exclusions: z.string().trim(),
  terms: z.string().trim(),
  items: z
    .array(
      z.object({
        kind: z.enum(['hotel', 'activity', 'vehicle', 'flight', 'visa', 'insurance', 'other']),
        day_no: z.string(),
        description: z.string().trim().min(1, 'Each item needs a description'),
        hotel_rate_id: z.string(),
        activity_rate_id: z.string(),
        vehicle_id: z.string(),
        qty: z.string().refine((v) => Number(v) > 0, 'Quantities must be more than zero'),
        unit_cost: money,
        unit_price: money,
      }),
    )
    .min(1, 'Add at least one item'),
})

const nul = (v: string) => (v.trim() === '' ? null : v.trim())

export async function saveQuotation(_: FormState, form: FormData): Promise<FormState> {
  let json: unknown
  try {
    json = JSON.parse(String(form.get('payload')))
  } catch {
    return { error: 'Could not read the form. Please reload and try again.' }
  }
  const parsed = Quote.safeParse(json)
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    const at = i.path[0] === 'items' && typeof i.path[1] === 'number' ? `Item ${i.path[1] + 1}: ` : ''
    return { error: at + i.message }
  }
  const { items, ...q } = parsed.data
  if (q.start_date && q.valid_until && q.valid_until < q.quote_date) return { error: 'Valid-until is before the quotation date' }
  const header = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, typeof v === 'string' && k !== 'client_name' ? nul(v) : v]))
  const p_items = items.map((it) => ({
    kind: it.kind,
    day_no: nul(it.day_no),
    description: it.description,
    hotel_rate_id: nul(it.hotel_rate_id),
    activity_rate_id: nul(it.activity_rate_id),
    vehicle_id: nul(it.vehicle_id),
    qty: Number(it.qty),
    unit_cost: toPaise(it.unit_cost),
    unit_price: toPaise(it.unit_price),
  }))

  const { supabase, org } = await getContext()
  const { data: id, error } = await supabase.rpc('save_quotation', { p_org: org.id, p: { ...header, id: q.id }, p_items })
  if (error) return { error: friendlyError(error.message) }
  if (q.lead_id) {
    await supabase.from('leads').update({ status: 'proposal' }).eq('id', q.lead_id).eq('org_id', org.id).in('status', ['initial', 'active'])
  }
  revalidatePath('/crm/quotations')
  redirect(`/crm/quotations/${id}`)
}

export async function setQuotationStatus(form: FormData) {
  const id = String(form.get('id'))
  const status = String(form.get('status'))
  if (!['draft', 'sent', 'accepted', 'rejected'].includes(status)) return
  const { supabase, org } = await getContext()
  const { data: q } = await supabase.from('quotations').update({ status }).eq('id', id).eq('org_id', org.id).select('lead_id').single()
  if (q?.lead_id && status === 'accepted') {
    await supabase.from('leads').update({ status: 'pipeline' }).eq('id', q.lead_id).eq('org_id', org.id).not('status', 'eq', 'booked')
  }
  revalidatePath(`/crm/quotations/${id}`)
  revalidatePath('/crm/quotations')
}
