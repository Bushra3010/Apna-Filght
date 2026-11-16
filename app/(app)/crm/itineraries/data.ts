import 'server-only'
import { getContext } from '@/lib/context'
import { getCities, getLookups } from '../data'

export async function getItineraryOptions() {
  const { supabase, org } = await getContext()
  const [{ data: routes }, titles, cities] = await Promise.all([
    supabase.from('routes').select('id, name').eq('org_id', org.id).order('name'),
    getLookups('package_title'),
    getCities(),
  ])
  return { routes: (routes ?? []) as { id: string; name: string }[], titles, cities }
}
