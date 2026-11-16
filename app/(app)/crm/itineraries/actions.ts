'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import type { FormState } from '@/components/form'

const Itinerary = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2, 'Enter a title'),
  route_id: z.string(),
  package_title_id: z.string(),
  nights: z.coerce.number().int().min(0).max(60),
  overview: z.string().trim(),
  days: z.array(z.object({ city_id: z.string(), title: z.string().trim(), description: z.string().trim() })).max(61),
})

export async function saveItinerary(_: FormState, form: FormData): Promise<FormState> {
  let json: unknown
  try {
    json = JSON.parse(String(form.get('payload')))
  } catch {
    return { error: 'Could not read the form. Please reload and try again.' }
  }
  const parsed = Itinerary.safeParse(json)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { days, ...p } = parsed.data
  const empty = days.findIndex((d) => !d.title)
  if (empty >= 0) return { error: `Day ${empty + 1}: enter a title` }
  const { supabase, org } = await getContext()
  const { data: id, error } = await supabase.rpc('save_itinerary', { p_org: org.id, p, p_days: days })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/crm/itineraries')
  redirect(`/crm/itineraries/${id}?saved=1`)
}
