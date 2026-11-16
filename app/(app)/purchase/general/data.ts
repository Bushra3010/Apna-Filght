import 'server-only'
import { getContext } from '@/lib/context'
import { getParties } from '../../crm/leads/data'
import { getStates } from '../../masters/ledgers/data'

export async function getPurchaseOptions() {
  const { supabase, org } = await getContext()
  const [suppliers, states, { data: accounts }, { data: o }] = await Promise.all([
    getParties('supplier'),
    getStates(),
    supabase.from('ledgers').select('id, name').eq('org_id', org.id).in('kind', ['expense', 'other', 'capital']).eq('is_active', true).order('name'),
    supabase.from('orgs').select('state_id').eq('id', org.id).single(),
  ])
  return { suppliers, states, accounts: (accounts ?? []) as { id: string; name: string }[], orgStateId: (o?.state_id as string | null) ?? null }
}
