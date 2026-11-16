import 'server-only'
import { getContext } from '@/lib/context'
import { getParties } from '../../crm/leads/data'
import { getStates } from '../../masters/ledgers/data'

export async function getInvoiceFormOptions() {
  const { supabase, org } = await getContext()
  const [customers, suppliers, states, { data: airlines }, { data: o }] = await Promise.all([
    getParties('customer'),
    getParties('supplier'),
    getStates(),
    supabase.from('airlines').select('id, code, name').order('name'),
    supabase.from('orgs').select('state_id').eq('id', org.id).single(),
  ])
  return {
    customers,
    suppliers,
    states,
    airlines: (airlines ?? []) as { id: string; code: string; name: string }[],
    orgStateId: (o?.state_id as string | null) ?? null,
  }
}
