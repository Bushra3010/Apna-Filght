import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FOLLOWUP_ACTIONS, LEAD_STATUSES, istDateTime, label, statusTone } from '@/lib/leads'
import { formatINR } from '@/lib/money'
import { LeadForm, type LeadRow } from '../lead-form'
import { getMembers, getParties } from '../data'
import { completeFollowup } from '../actions'

export const metadata = { title: 'Lead' }

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: lead }, { data: followups }, { data: invoices }] = await Promise.all([
    supabase.from('leads').select('*').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('lead_followups').select('id, action, due_at, done_at, outcome').eq('lead_id', id).order('due_at', { ascending: false }),
    supabase.from('invoices').select('id, invoice_no, invoice_date, total').eq('lead_id', id).order('invoice_date'),
  ])
  if (!lead) notFound()

  return (
    <>
      <PageHeader
        title={`${lead.lead_no} · ${lead.guest_name}`}
        description={`Enquiry on ${new Date(lead.enquiry_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`}
        actions={
          <>
            <Badge variant={statusTone(lead.status)}>{label(LEAD_STATUSES, lead.status)}</Badge>
            <LinkButton href={`/crm/quotations/new?lead=${lead.id}`} variant="outline">Create quotation</LinkButton>
            <LinkButton href={`/billing/invoices/new?lead=${lead.id}`}>Create invoice</LinkButton>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <LeadForm lead={lead as LeadRow} parties={await getParties()} members={await getMembers()} />

        <aside className="grid content-start gap-4">
          <section className="rounded-xl border p-4">
            <h2 className="mb-3 text-sm font-medium">Follow-ups</h2>
            {followups?.length ? (
              <ul className="grid gap-3 text-sm">
                {followups.map((f) => (
                  <li key={f.id} className="rounded-lg border p-2.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{label(FOLLOWUP_ACTIONS, f.action)}</span>
                      {f.done_at ? (
                        <Badge variant="outline">Done</Badge>
                      ) : new Date(f.due_at) < new Date() ? (
                        <Badge variant="destructive">Overdue</Badge>
                      ) : (
                        <Badge variant="secondary">Upcoming</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">{istDateTime(f.due_at)}</p>
                    {f.outcome && <p className="mt-1">{f.outcome}</p>}
                    {!f.done_at && (
                      <form action={completeFollowup} className="mt-2 flex gap-2">
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="lead_id" value={lead.id} />
                        <Input name="outcome" placeholder="Outcome (optional)" className="h-7 text-xs" />
                        <Button type="submit" size="sm" variant="outline">Done</Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No follow-ups.</p>
            )}
          </section>
          <section className="rounded-xl border p-4">
            <h2 className="mb-3 text-sm font-medium">Invoices</h2>
            {invoices?.length ? (
              <ul className="grid gap-1 text-sm">
                {invoices.map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <a href={`/billing/invoices/${i.id}`} className="hover:underline">{i.invoice_no}</a>
                    <span className="tabular-nums">{formatINR(i.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Not billed yet.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}
