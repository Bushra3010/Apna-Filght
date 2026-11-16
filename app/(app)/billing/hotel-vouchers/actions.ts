'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import type { FormState } from '@/components/form'

const opt = z.string().trim().transform((v) => (v === '' ? null : v))
const Voucher = z.object({
  id: opt, kind: z.enum(['hotel', 'cruise']), voucher_date: z.iso.date('Choose the date'),
  party_ledger_id: opt, invoice_id: opt, hotel_id: opt,
  property_name: z.string().trim().min(2, 'Enter the hotel or cruise name'),
  guest_name: z.string().trim().min(2, 'Enter the lead guest'),
  other_guests: z.string().trim(),
  adults: z.coerce.number().int().min(1).max(99), children: z.coerce.number().int().min(0).max(99),
  check_in: z.iso.date('Choose check-in'), check_out: z.iso.date('Choose check-out'),
  rooms: z.coerce.number().int().min(1).max(99),
  room_type: opt, meal_plan: opt, confirmation_no: opt, contact: opt, inclusions: opt, notes: opt,
})

export async function saveHotelVoucher(_: FormState, form: FormData): Promise<FormState> {
  const p = Voucher.safeParse(Object.fromEntries(form))
  if (!p.success) return { error: p.error.issues[0].message }
  const { other_guests, ...v } = p.data
  if (v.check_out <= v.check_in) return { error: 'Check-out must be after check-in' }
  const guests = other_guests.split('\n').map((g) => g.trim()).filter(Boolean)
  const { supabase, org } = await getContext()
  const { data: id, error } = await supabase.rpc('save_hotel_voucher', { p_org: org.id, p: { ...v, guests } })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/billing/hotel-vouchers')
  redirect(`/billing/hotel-vouchers/${id}`)
}
