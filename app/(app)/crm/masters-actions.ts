'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { ownedBy } from '@/lib/guard'
import { toPaise } from '@/lib/money'
import type { FormState } from '@/components/form'

const opt = z.string().trim().transform((v) => (v === '' ? null : v))
const money = z.string().refine((v) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Amounts must be zero or more')
const fail = (m: string): FormState => ({ error: m })

// ---------------- hotels
const Hotel = z.object({
  id: opt, name: z.string().trim().min(2, 'Enter the hotel name'), city_id: opt, address: opt,
  star_rating: opt, contact_name: opt, phone: opt, mobile: opt, email: opt, supplier_ledger_id: opt,
})
export async function saveHotel(_: FormState, form: FormData): Promise<FormState> {
  const p = Hotel.safeParse(Object.fromEntries(form))
  if (!p.success) return fail(p.error.issues[0].message)
  const { id, star_rating, ...d } = p.data
  const { supabase, org } = await getContext()
  if (!(await ownedBy(supabase, org.id, 'ledgers', [d.supplier_ledger_id]))) return fail('Choose a supplier from this company')
  const row = { ...d, org_id: org.id, star_rating: star_rating ? Number(star_rating) : null }
  const res = id
    ? await supabase.from('hotels').update(row).eq('id', id).eq('org_id', org.id).select('id').single()
    : await supabase.from('hotels').insert(row).select('id').single()
  if (res.error) return fail(friendlyError(res.error.message))
  revalidatePath('/crm/hotels')
  redirect(`/crm/hotels/${res.data.id}`)
}

const Rate = z.object({
  hotel_id: z.string().uuid(), package_class_id: opt, room_category_id: opt, meal_plan_id: opt,
  pax_per_room: z.coerce.number().int().min(1).max(10),
  rate_type: z.enum(['per_room_night', 'per_person_night', 'extra_adult', 'extra_child']),
  sell_rate: money, cost_rate: money, valid_from: z.iso.date('Choose the start date'), valid_to: z.iso.date('Choose the end date'),
})
export async function addHotelRate(_: FormState, form: FormData): Promise<FormState> {
  const p = Rate.safeParse(Object.fromEntries(form))
  if (!p.success) return fail(p.error.issues[0].message)
  const d = p.data
  if (d.valid_to < d.valid_from) return fail('The end date is before the start date')
  if (toPaise(d.sell_rate) <= 0) return fail('Enter the selling rate')
  const { supabase, org } = await getContext()
  if (!(await ownedBy(supabase, org.id, 'hotels', [d.hotel_id]))) return fail('Hotel not found')
  if (!(await ownedBy(supabase, org.id, 'lookups', [d.package_class_id, d.room_category_id, d.meal_plan_id]))) return fail('Choose options from this company’s lists')
  const { error } = await supabase.from('hotel_rates').insert({ ...d, org_id: org.id, sell_rate: toPaise(d.sell_rate), cost_rate: toPaise(d.cost_rate) })
  if (error) return fail(friendlyError(error.message))
  revalidatePath(`/crm/hotels/${d.hotel_id}`)
  return undefined
}

export async function deleteRow(form: FormData) {
  const table = String(form.get('table'))
  const id = String(form.get('id'))
  const back = String(form.get('back') ?? '/crm/hotels')
  if (!['hotel_rates', 'activity_rates', 'vehicles', 'routes', 'policies'].includes(table)) return
  const { supabase, org } = await getContext()
  await supabase.from(table).delete().eq('id', id).eq('org_id', org.id)
  revalidatePath(back)
}

// ---------------- activity rates
const Activity = z.object({
  activity_id: z.string().uuid('Choose the activity'), city_id: opt, location: opt,
  unit: z.enum(['per_person', 'per_group', 'per_vehicle']), start_time: opt, end_time: opt,
  duration_minutes: opt, sell_rate: money, cost_rate: money, supplier_ledger_id: opt,
})
export async function addActivityRate(_: FormState, form: FormData): Promise<FormState> {
  const p = Activity.safeParse(Object.fromEntries(form))
  if (!p.success) return fail(p.error.issues[0].message)
  const d = p.data
  if (toPaise(d.sell_rate) <= 0) return fail('Enter the selling rate')
  const { supabase, org } = await getContext()
  if (!(await ownedBy(supabase, org.id, 'lookups', [d.activity_id]))) return fail('Choose an activity from your list')
  if (!(await ownedBy(supabase, org.id, 'ledgers', [d.supplier_ledger_id]))) return fail('Choose a supplier from this company')
  const { error } = await supabase.from('activity_rates').insert({
    ...d, org_id: org.id, sell_rate: toPaise(d.sell_rate), cost_rate: toPaise(d.cost_rate),
    duration_minutes: d.duration_minutes ? Math.round(Number(d.duration_minutes)) : null,
  })
  if (error) return fail(friendlyError(error.message))
  revalidatePath('/crm/activities')
  return undefined
}

// ---------------- vehicles
const Vehicle = z.object({
  id: opt, name: z.string().trim().min(2, 'Enter the vehicle name'), capacity: opt,
  rate_per_km: money, min_km_per_day: z.coerce.number().int().min(0), night_charge: money, supplier_ledger_id: opt,
})
export async function saveVehicle(_: FormState, form: FormData): Promise<FormState> {
  const p = Vehicle.safeParse(Object.fromEntries(form))
  if (!p.success) return fail(p.error.issues[0].message)
  const { id, ...d } = p.data
  const { supabase, org } = await getContext()
  if (!(await ownedBy(supabase, org.id, 'ledgers', [d.supplier_ledger_id]))) return fail('Choose a supplier from this company')
  const row = { ...d, org_id: org.id, capacity: d.capacity ? Number(d.capacity) : null, rate_per_km: toPaise(d.rate_per_km), night_charge: toPaise(d.night_charge) }
  const { error } = id ? await supabase.from('vehicles').update(row).eq('id', id).eq('org_id', org.id) : await supabase.from('vehicles').insert(row)
  if (error) return fail(friendlyError(error.message))
  revalidatePath('/crm/vehicles')
  return undefined
}

// ---------------- routes
const Route = z.object({
  id: opt, name: z.string().trim().min(2, 'Enter the route'), destination_id: opt,
  has_transport: z.preprocess((v) => v === 'on', z.boolean()), supplier_ledger_id: opt,
})
export async function saveRoute(_: FormState, form: FormData): Promise<FormState> {
  const p = Route.safeParse(Object.fromEntries(form))
  if (!p.success) return fail(p.error.issues[0].message)
  const { id, ...d } = p.data
  const { supabase, org } = await getContext()
  if (!(await ownedBy(supabase, org.id, 'lookups', [d.destination_id]))) return fail('Choose a destination from your list')
  if (!(await ownedBy(supabase, org.id, 'ledgers', [d.supplier_ledger_id]))) return fail('Choose a supplier from this company')
  const { error } = id ? await supabase.from('routes').update(d).eq('id', id).eq('org_id', org.id) : await supabase.from('routes').insert({ ...d, org_id: org.id })
  if (error) return fail(friendlyError(error.message))
  revalidatePath('/crm/routes')
  return undefined
}

// ---------------- policies
const Policy = z.object({ id: opt, kind: z.enum(['general', 'other']), name: z.string().trim().min(2, 'Enter a name'), body: z.string().trim() })
export async function savePolicy(_: FormState, form: FormData): Promise<FormState> {
  const p = Policy.safeParse(Object.fromEntries(form))
  if (!p.success) return fail(p.error.issues[0].message)
  const { id, ...d } = p.data
  const { supabase, org } = await getContext()
  const { error } = id ? await supabase.from('policies').update(d).eq('id', id).eq('org_id', org.id) : await supabase.from('policies').insert({ ...d, org_id: org.id })
  if (error) return fail(friendlyError(error.message))
  revalidatePath('/crm/policies')
  return undefined
}
