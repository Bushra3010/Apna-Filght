'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import { airportCode, searchFlights, type Flight } from '@/lib/flights'

export type FlightSearch = { flights?: Flight[]; error?: string }

/** Look up the direct flights for a route and date. Nothing is saved. */
export async function findFlights(from: string, to: string, date: string): Promise<FlightSearch> {
  await getContext() // signed-in members only
  const f = airportCode(from)
  const t = airportCode(to)
  if (!f || !t) return { error: 'Pick both cities from the list' }
  if (f === t) return { error: 'From and To are the same' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick the travel date' }
  try {
    const flights = await searchFlights(f, t, date)
    return flights.length ? { flights } : { error: 'No direct flights found for that day. You can add one by hand below.' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Flight search did not work' }
  }
}

const time = z.string().regex(/^\d{2}:\d{2}$/).nullable()
const Option = z.object({
  airline: z.string().trim().min(1, 'Enter the airline').max(60),
  flight_no: z.string().trim().min(2, 'Enter the flight number').max(12),
  from_code: z.string().regex(/^[A-Z]{3}$/, 'Pick the From city'),
  to_code: z.string().regex(/^[A-Z]{3}$/, 'Pick the To city'),
  travel_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the travel date'),
  depart_time: time,
  arrive_time: time,
  price: z.string(),
})

/** Save the chosen flights, each with the agent's own rate (rupees as typed; blank = not priced yet). */
export async function addFlightOptions(leadId: string, options: (Flight & { price: string })[]): Promise<{ error?: string }> {
  const parsed = z.array(Option).min(1, 'Tick at least one flight').max(10).safeParse(options)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, org, member } = await getContext()
  const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('id', leadId).eq('org_id', org.id)
  if (!count) return { error: 'Lead not found' }
  const { error } = await supabase.from('lead_flight_options').insert(
    parsed.data.map((o) => ({ ...o, price: o.price ? toPaise(o.price) : null, org_id: org.id, lead_id: leadId, created_by: member.id })),
  )
  if (error) return { error: friendlyError(error.message) }
  revalidatePath(`/crm/leads/${leadId}`)
  return {}
}

export async function setFlightOptionPrice(form: FormData) {
  const id = String(form.get('id'))
  const leadId = String(form.get('lead_id'))
  const price = String(form.get('price') ?? '').trim()
  const { supabase, org } = await getContext()
  await supabase.from('lead_flight_options').update({ price: price ? toPaise(price) : null }).eq('id', id).eq('org_id', org.id)
  revalidatePath(`/crm/leads/${leadId}`)
}

export async function removeFlightOption(form: FormData) {
  const id = String(form.get('id'))
  const leadId = String(form.get('lead_id'))
  const { supabase, org } = await getContext()
  await supabase.from('lead_flight_options').delete().eq('id', id).eq('org_id', org.id)
  revalidatePath(`/crm/leads/${leadId}`)
}
