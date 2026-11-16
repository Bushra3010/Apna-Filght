import 'server-only'
import { getContext } from '@/lib/context'

export type Opt = { id: string; name: string }

export async function getLookups(kind: string) {
  const { supabase, org } = await getContext()
  const { data } = await supabase.from('lookups').select('id, name').eq('org_id', org.id).eq('kind', kind).eq('is_active', true).order('sort').order('name')
  return (data ?? []) as Opt[]
}

export async function getCities() {
  const { supabase } = await getContext()
  const { data } = await supabase.from('cities').select('id, name, country_code').order('name')
  return (data ?? []).map((c) => ({ id: c.id, name: c.country_code === 'IN' ? c.name : `${c.name} (${c.country_code})` })) as Opt[]
}

export async function getSuppliers() {
  const { supabase, org } = await getContext()
  const { data } = await supabase.from('ledgers').select('id, name').eq('org_id', org.id).eq('kind', 'supplier').eq('is_active', true).order('name')
  return (data ?? []) as Opt[]
}
