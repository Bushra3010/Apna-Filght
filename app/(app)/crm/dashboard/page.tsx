import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatINR } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { Panel, Tile } from '@/components/tile'
import { cn } from '@/lib/utils'

export const metadata = { title: 'CRM dashboard' }

type Crm = {
  funnel: Record<string, number>
  live: number
  followups_left: number
  followups_today: number
  pendency: { d3_7: number; d8_15: number; d16_30: number; d30_plus: number }
  proposals: { lt1: number; l1_3: number; l3_5: number; gt5: number; value: number }
  trips: { running: number; upcoming: number }
  people: { member: string; leads: number; open: number; booked: number; sales: number }[]
}

const SCOPES = [['self', 'Me'], ['team', 'My team'], ['all', 'Everyone']] as const

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[96px_1fr_40px] items-center gap-3 text-xs">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="h-2 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <span className="text-right font-semibold tabular-nums">{r.n}</span>
        </li>
      ))}
    </ul>
  )
}

export default async function CrmDashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const sp = await searchParams
  const scope = SCOPES.some(([k]) => k === sp.scope) ? sp.scope! : 'team'
  const { supabase, org, fy } = await getContext()
  const { data, error } = await supabase.rpc('crm_dashboard', { p_org: org.id, p_fy: fy.id, p_scope: scope })
  if (error) throw new Error(error.message)
  const d = data as Crm
  const f = d.funnel

  return (
    <>
      <PageHeader
        title="CRM dashboard"
        description="Sales funnel, pending leads and team performance"
        actions={
          <div className="flex rounded-full border border-border bg-card p-1">
            {SCOPES.map(([k, l]) => (
              <Link key={k} href={`/crm/dashboard?scope=${k}`} className={cn('rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground', scope === k && 'bg-primary text-primary-foreground')}>{l}</Link>
            ))}
          </div>
        }
      />
      <div className="grid gap-6">
        <Panel title="Sales funnel" count={d.live} href="/crm/leads">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Tile tone="blue" tag="Leads" title="Initial" sub="New enquiries" value={String(f.initial ?? 0)} href="/crm/leads?status=initial" />
            <Tile tone="cyan" tag="Leads" title="Active" sub="In conversation" value={String(f.active ?? 0)} href="/crm/leads?status=active" />
            <Tile tone="purple" tag="Leads" title="Proposal" sub="Quotation sent" value={String(f.proposal ?? 0)} href="/crm/leads?status=proposal" />
            <Tile tone="orange" tag="Leads" title="Negotiation" sub="Working on price" value={String(f.negotiation ?? 0)} href="/crm/leads?status=negotiation" />
            <Tile tone="red" tag="Leads" title="Pipeline" sub="Accepted, to book" value={String(f.pipeline ?? 0)} href="/crm/leads?status=pipeline" />
            <Tile tone="green" tag="Leads" title="Booked" sub={`Lost: ${(f.not_interested ?? 0) + (f.fake ?? 0)}`} value={String(f.booked ?? 0)} href="/crm/leads?status=booked" />
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Follow-ups" href="/crm/leads?due=today">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Overdue</p><p className={cn('text-3xl font-bold tabular-nums', d.followups_left > 0 && 'text-destructive')}>{d.followups_left}</p></div>
              <div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Due today</p><p className="text-3xl font-bold tabular-nums text-primary">{d.followups_today}</p></div>
              <div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Trips running</p><p className="text-3xl font-bold tabular-nums">{d.trips.running}</p></div>
              <div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Trips in 30 days</p><p className="text-3xl font-bold tabular-nums">{d.trips.upcoming}</p></div>
            </div>
          </Panel>
          <Panel title="Pending leads" count="days idle">
            <Bars rows={[{ label: '3–7 days', n: d.pendency.d3_7 }, { label: '8–15 days', n: d.pendency.d8_15 }, { label: '16–30 days', n: d.pendency.d16_30 }, { label: 'Over 30 days', n: d.pendency.d30_plus }]} />
            <p className="mt-4 text-xs text-muted-foreground">Open leads with no follow-up activity for that long.</p>
          </Panel>
          <Panel title="Proposal value" count={formatINR(d.proposals.value).replace(/\.00$/, '')} href="/crm/quotations">
            <Bars rows={[{ label: 'Under ₹1 lakh', n: d.proposals.lt1 }, { label: '₹1–3 lakh', n: d.proposals.l1_3 }, { label: '₹3–5 lakh', n: d.proposals.l3_5 }, { label: 'Over ₹5 lakh', n: d.proposals.gt5 }]} />
            <p className="mt-4 text-xs text-muted-foreground">Open leads by their highest quotation.</p>
          </Panel>
        </div>

        <Panel title="Performance" count={`FY ${fy.label}`} href="/crm/transfer">
          {d.people.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="py-2 text-left font-medium">Person</th><th className="py-2 text-right font-medium">Leads</th><th className="py-2 text-right font-medium">Open</th><th className="py-2 text-right font-medium">Booked</th><th className="py-2 text-right font-medium">Conversion</th><th className="py-2 text-right font-medium">Sales</th></tr>
                </thead>
                <tbody>
                  {d.people.map((p) => (
                    <tr key={p.member} className="border-t border-border">
                      <td className="py-2.5 font-medium">{p.member}</td>
                      <td className="py-2.5 text-right tabular-nums">{p.leads}</td>
                      <td className="py-2.5 text-right tabular-nums">{p.open}</td>
                      <td className="py-2.5 text-right tabular-nums">{p.booked}</td>
                      <td className="py-2.5 text-right tabular-nums">{p.leads ? `${Math.round((p.booked / p.leads) * 100)}%` : '—'}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{formatINR(p.sales).replace(/\.00$/, '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No team members in this view.</p>
          )}
        </Panel>
      </div>
    </>
  )
}
