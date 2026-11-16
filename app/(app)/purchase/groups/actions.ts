'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import type { FormState } from '@/components/form'

const opt = z.string().trim().transform((v) => (v === '' ? null : v))
const money = z.string().refine((v) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Amounts must be zero or more')
const Group = z.object({
  supplier_ledger_id: z.string().uuid('Choose the supplier'),
  bill_date: z.iso.date('Choose the date'),
  bill_type: z.enum(['domestic', 'international']),
  supplier_bill_no: opt,
  supplier_bill_date: opt,
  place_of_supply_state_id: opt,
  airline_id: opt,
  flight_no: opt,
  pnr: opt,
  sector: opt,
  travel_date: z.iso.date('Choose the travel date'),
  seats: z.coerce.number().int().min(1, 'At least one seat').max(999),
  amount: money.refine((v) => toPaise(v) > 0, 'Enter the total cost'),
  gst: money,
  tds: money,
  notes: opt,
})

export async function saveGroupPurchase(_: FormState, form: FormData): Promise<FormState> {
  const p = Group.safeParse(Object.fromEntries(form))
  if (!p.success) return { error: p.error.issues[0].message }
  const g = p.data
  const { supabase, org } = await getContext()
  const { data: id, error } = await supabase.rpc('save_group_purchase', {
    p_org: org.id,
    p: { ...g, amount: toPaise(g.amount), gst: toPaise(g.gst), tds: toPaise(g.tds) },
  })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/purchase/groups')
  redirect(`/purchase/groups/${id}`)
}
