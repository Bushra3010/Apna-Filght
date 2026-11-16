import Link from 'next/link'
import { ALERT_KINDS, loadAlerts } from '@/lib/alerts'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Alerts' }

export default async function AlertsPage() {
  const alerts = await loadAlerts()
  const groups = ALERT_KINDS.map((k) => ({ ...k, rows: alerts.filter((a) => a.kind === k.key) })).filter((g) => g.rows.length)
  const href = (kind: string, id: string) => (kind === 'overdue_followup' ? `/crm/leads/${id}` : `/billing/invoices/${id}`)
  return (
    <>
      <PageHeader title="Alerts" description="Things to check before they become mistakes in your accounts or GST returns" />
      {groups.length ? (
        <div className="grid gap-6">
          {groups.map((g) => (
            <section key={g.key} className="rounded-3xl bg-card p-5 md:p-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{g.title}</h2>
                <Badge variant={g.tone === 'bad' ? 'destructive' : 'secondary'}>{g.rows.length}</Badge>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">{g.hint}</p>
              <ul className="grid gap-2 text-sm">
                {g.rows.map((a) => (
                  <li key={`${a.kind}-${a.doc_id}`}>
                    <Link href={href(a.kind, a.doc_id)} className="grid gap-1 rounded-2xl bg-muted/60 px-4 py-3 hover:bg-muted sm:grid-cols-[120px_1fr_auto] sm:items-center sm:gap-4">
                      <span className="font-semibold">{a.doc_no}</span>
                      <span className="min-w-0"><span className="font-medium">{a.party}</span> <span className="text-muted-foreground">· {new Date(a.doc_date).toLocaleDateString('en-IN')} · {a.detail}</span></span>
                      {a.amount !== null && <span className="font-semibold tabular-nums sm:text-right">{formatAmount(a.amount)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState>Nothing needs attention.</EmptyState>
      )}
    </>
  )
}
