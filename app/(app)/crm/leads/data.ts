import 'server-only'
import { getContext } from '@/lib/context'

export async function getParties(kind: 'customer' | 'supplier' = 'customer') {
  const { supabase, org } = await getContext()
  const { data } = await supabase
    .from('ledgers')
    .select('id, name, state_id, mobile')
    .eq('org_id', org.id)
    .eq('kind', kind)
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as { id: string; name: string; state_id: string | null; mobile: string | null }[]
}
