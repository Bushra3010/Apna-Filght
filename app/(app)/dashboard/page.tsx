import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatINR } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { AgeingBars, MonthlySalesChart } from '@/components/charts'

export const metadata = { title: 'Dashboard' }

type Summary = { sales: number; margin: number; receivable: number; receipts: number; open_leads: number; followups_due: number }

export default async function DashboardPage() {
  const { supabase, org, fy } = await getContext()
  const [{ data: summary }, { data: recent }, { data: due }, { data: monthly }, { data: ageing }] = await Promise.all([
    supabase.rpc('dashboard_summary', { p_org: org.id, p_fy: fy.id }),
    supabase
      .from('invoices')
      .select('id, invoice_no, invoice_date, total, ledgers!invoices_party_ledger_id_fkey(name)')
      .eq('org_id', org.id)
      .eq('fy_id', fy.id)
      .eq('doc_kind', 'invoice')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('lead_followups')
      .select('id, action, due_at, leads(id, lead_no, guest_name, phone)')
      .eq('org_id', org.id)
      .is('done_at', null)
      .order('due_at')
      .limit(5),
    supabase.rpc('monthly_sales', { p_org: org.id, p_fy: fy.id }),
    supabase.rpc('receivable_ageing', { p_org: org.id }),
  ])
  const months = ((monthly ?? []) as { month: string; sales: number; margin: number }[]).map((m) => ({
    label: new Date(m.month + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    sales: Number(m.sales),
    margin: Number(m.margin),
  }))
  const buckets = ((ageing ?? []) as { bucket: string; amount: number; invoices: number }[]).map((b) => ({ ...b, amount: Number(b.amount), invoices: Number(b.invoices) }))
  const s = (summary ?? {}) as Summary

  const tiles = [
    { label: 'Sales (FY)', value: formatINR(s.sales) },
    { label: 'Margin (FY)', value: formatINR(s.margin) },
    { label: 'Receivable', value: formatINR(s.receivable) },
    { label: 'Received (FY)', value: formatINR(s.receipts) },
    { label: 'Open leads', value: String(s.open_leads ?? 0) },
    { label: 'Follow-ups due', value: String(s.followups_due ?? 0) },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${org.name} · FY ${fy.label}`}
        actions={
          <>
            <LinkButton href="/crm/leads/new" variant="outline">New lead</LinkButton>
            <LinkButton href="/billing/invoices/new">New invoice</LinkButton>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border p-4"><MonthlySalesChart months={months} /></section>
        <section className="rounded-xl border p-4"><AgeingBars buckets={buckets} /></section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-medium">Recent invoices</h2>
          {recent?.length ? (
            <ul className="divide-y text-sm">
              {recent.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <Link href={`/billing/invoices/${i.id}`} className="truncate hover:underline">
                    {i.invoice_no} · {(i.ledgers as unknown as { name: string } | null)?.name}
                  </Link>
                  <span className="shrink-0 tabular-nums">{formatINR(i.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          )}
        </section>
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-medium">Upcoming follow-ups</h2>
          {due?.length ? (
            <ul className="divide-y text-sm">
              {due.map((f) => {
                const l = f.leads as unknown as { id: string; lead_no: string; guest_name: string; phone: string }
                const overdue = new Date(f.due_at) < new Date()
                return (
                  <li key={f.id} className="flex justify-between gap-3 py-2">
                    <Link href={`/crm/leads/${l.id}`} className="truncate hover:underline">
                      {l.lead_no} · {l.guest_name}
                    </Link>
                    <span className={overdue ? 'shrink-0 text-destructive' : 'shrink-0 text-muted-foreground'}>
                      {f.action.replace('_', ' ')} · {new Date(f.due_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          )}
        </section>
      </div>
    </>
  )
}
