import { getContext } from '@/lib/context'
import { LEAD_STATUSES } from '@/lib/leads'
import { PageHeader } from '@/components/page-header'
import { Panel } from '@/components/tile'
import { TransferForm } from './transfer-form'

export const metadata = { title: 'Lead transfer' }

export default async function TransferPage() {
  const { supabase, org } = await getContext()
  const [{ data: members }, { data: leads }] = await Promise.all([
    supabase.from('org_members').select('id, display_name, is_active').eq('org_id', org.id).order('display_name'),
    supabase.from('leads').select('assigned_to, status').eq('org_id', org.id),
  ])
  const statuses = LEAD_STATUSES.filter(([v]) => !['not_interested', 'fake'].includes(v))
  const count = (m: string | null, s: string) => leads?.filter((l) => l.assigned_to === m && l.status === s).length ?? 0
  const rows = [...(members ?? []).map((m) => ({ id: m.id as string | null, name: m.display_name })), { id: null, name: 'Unassigned' }]

  return (
    <>
      <PageHeader title="Lead transfer" description="Hand leads over when someone is away or leaves" />
      <div className="grid gap-6">
        <Panel title="Leads by person">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="py-2 text-left font-medium">Person</th>{statuses.map(([v, l]) => <th key={v} className="py-2 text-right font-medium">{l}</th>)}<th className="py-2 text-right font-medium">Total</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const total = statuses.reduce((a, [v]) => a + count(r.id, v), 0)
                  return (
                    <tr key={r.id ?? 'none'} className="border-t border-border">
                      <td className="py-2.5 font-medium">{r.name}</td>
                      {statuses.map(([v]) => <td key={v} className="py-2.5 text-right tabular-nums">{count(r.id, v) || ''}</td>)}
                      <td className="py-2.5 text-right font-semibold tabular-nums">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Transfer">
          <TransferForm members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name, active: m.is_active }))} />
        </Panel>
      </div>
    </>
  )
}
