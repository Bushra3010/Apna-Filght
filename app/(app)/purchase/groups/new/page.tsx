import { getContext } from '@/lib/context'
import { todayIST } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { getParties } from '../../../crm/leads/data'
import { getStates } from '../../../masters/ledgers/data'
import { GroupForm } from '../group-form'

export const metadata = { title: 'New group purchase' }

export default async function Page() {
  const { supabase, org } = await getContext()
  const [suppliers, states, { data: airlines }, { data: o }] = await Promise.all([
    getParties('supplier'), getStates(),
    supabase.from('airlines').select('id, code, name').order('name'),
    supabase.from('orgs').select('state_id').eq('id', org.id).single(),
  ])
  return (
    <>
      <PageHeader title="New group purchase" description="A block of seats (group fare or fixed departure) you sell one by one on invoices" />
      <GroupForm suppliers={suppliers} airlines={(airlines ?? []) as { id: string; code: string; name: string }[]} states={states} orgStateId={o?.state_id ?? null} today={todayIST()} />
    </>
  )
}
