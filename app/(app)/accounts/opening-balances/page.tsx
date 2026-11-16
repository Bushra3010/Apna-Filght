import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { OpeningForm } from './opening-form'

export const metadata = { title: 'Opening balances' }

export default async function OpeningBalancesPage() {
  const { supabase, org, fy } = await getContext()
  const [{ data: ledgers }, { data: ob }] = await Promise.all([
    supabase.from('ledgers').select('id, name, account_groups(name, nature, sort)').eq('org_id', org.id).order('name'),
    supabase.from('opening_balances').select('ledger_id, amount').eq('fy_id', fy.id),
  ])
  const amt = new Map((ob ?? []).map((o) => [o.ledger_id, Number(o.amount)]))
  type G = { name: string; nature: string; sort: number }
  const rows = (ledgers ?? [])
    .map((l) => ({ id: l.id, name: l.name, g: l.account_groups as unknown as G, amount: amt.get(l.id) ?? 0 }))
    .filter((l) => !['income', 'expense'].includes(l.g.nature) || l.amount !== 0)
    .sort((a, b) => a.g.sort - b.g.sort || a.g.name.localeCompare(b.g.name) || a.name.localeCompare(b.name))
    .map((l) => ({ id: l.id, name: l.name, group: l.g.name, amount: l.amount }))
  return (
    <>
      <PageHeader
        title="Opening balances"
        description={`Balances on ${new Date(fy.starts_on).toLocaleDateString('en-IN', { dateStyle: 'medium' })} (start of FY ${fy.label}). Client and supplier balances you carry over from your old system go here too.`}
      />
      {fy.is_closed && <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">This year is closed, so its opening balances are locked.</p>}
      <OpeningForm ledgers={rows} locked={fy.is_closed} />
    </>
  )
}
