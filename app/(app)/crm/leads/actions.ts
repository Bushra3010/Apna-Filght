'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import type { FormState } from '@/components/form'

const opt = z.string().trim().transform((v) => (v === '' ? null : v))
const count = z.coerce.number().int().min(0).max(99)

const Schema = z
  .object({
    id: opt,
    guest_name: z.string().trim().min(2, 'Enter the guest name'),
    phone: z.string().trim().min(6, 'Enter a phone number'),
    email: opt,
    party_ledger_id: opt,
    start_place: opt,
    travel_date: opt,
    travel_date_open: z.preprocess((v) => v === 'on', z.boolean()),
    adults: z.coerce.number().int().min(1, 'At least one adult').max(99),
    children_above_12: count,
    children_6_12: count,
    infants: count,
    source: opt,
    reference: opt,
    budget: z.string(),
    remarks: z.string().max(250, 'Remarks can be at most 250 characters'),
    status: z.string(),
    followup_action: opt,
    followup_date: opt,
    followup_slot: opt,
  })
  .refine((d) => d.travel_date || d.travel_date_open, { message: 'Pick a travel date or tick “date is open”' })

export async function saveLead(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  if (!d.id && !d.followup_date) return { error: 'Set the next follow-up date' }
  const { supabase, org } = await getContext()

  const payload = {
    ...d,
    services: form.getAll('services').map(String),
    budget: d.budget ? toPaise(d.budget) : null,
    followup: d.followup_date
      ? { action: d.followup_action ?? 'call', due_at: `${d.followup_date}T${d.followup_slot ?? '09:00'}:00+05:30` }
      : undefined,
  }
  const { data: id, error } = await supabase.rpc('save_lead', { p_org: org.id, p: payload })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/crm/leads')
  redirect(`/crm/leads/${id}`)
}

export async function completeFollowup(form: FormData) {
  const id = String(form.get('id'))
  const leadId = String(form.get('lead_id'))
  const outcome = String(form.get('outcome') ?? '').trim() || null
  const { supabase, org } = await getContext()
  await supabase.from('lead_followups').update({ done_at: new Date().toISOString(), outcome }).eq('id', id).eq('org_id', org.id)
  revalidatePath(`/crm/leads/${leadId}`)
}
