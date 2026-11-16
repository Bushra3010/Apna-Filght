import Link from 'next/link'
import { getContext } from '@/lib/context'
import { todayIST } from '@/lib/dates'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LEAD_SERVICES, LEAD_SOURCES, LEAD_STATUSES, istDateTime, label, statusTone } from '@/lib/leads'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Leads' }

type SP = { status?: string; service?: string; source?: string; q?: string; due?: string; who?: string }

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { supabase, org, member } = await getContext()
  const { data: team } = await supabase.from('org_members').select('id, display_name').eq('org_id', org.id).eq('is_active', true).order('display_name')

  let query = supabase
    .from('leads')
    .select('id, lead_no, enquiry_date, guest_name, phone, start_place, travel_date, travel_date_open, services, adults, children_above_12, children_6_12, infants, status, next_followup_at, last_followup_at, org_members!leads_assigned_to_fkey(display_name)')
    .eq('org_id', org.id)
    .order('enquiry_date', { ascending: false })
    .order('lead_no', { ascending: false })
    .limit(100)
  if (sp.status) query = query.eq('status', sp.status)
  if (sp.service) query = query.contains('services', [sp.service])
  if (sp.source) query = query.eq('source', sp.source)
  if (sp.who === 'me') query = query.eq('assigned_to', member.id)
  else if (sp.who === 'none') query = query.is('assigned_to', null)
  else if (sp.who) query = query.eq('assigned_to', sp.who)
  if (sp.due === 'today') query = query.lte('next_followup_at', `${todayIST()}T23:59:59+05:30`)
  if (sp.q) {
    const q = sp.q.replace(/[,()]/g, ' ')
    query = query.or(`guest_name.ilike.%${q}%,phone.ilike.%${q}%,lead_no.ilike.%${q}%`)
  }

  const [{ data: leads }, { data: all }] = await Promise.all([
    query,
    supabase.from('leads').select('status').eq('org_id', org.id),
  ])
  const counts = new Map<string, number>()
  all?.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1))

  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][])
    return `/crm/leads${p.size ? `?${p}` : ''}`
  }

  return (
    <>
      <PageHeader title="Leads" description="Travel enquiries and follow-ups" actions={<LinkButton href="/crm/leads/new">New lead</LinkButton>} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href={href({ status: undefined })} className={cn('rounded-full border border-border bg-card px-3.5 py-1.5 text-sm', !sp.status && 'border-primary bg-primary/10')}>
          All <span className="text-muted-foreground">{all?.length ?? 0}</span>
        </Link>
        {LEAD_STATUSES.map(([v, l]) => (
          <Link key={v} href={href({ status: v })} className={cn('rounded-full border border-border bg-card px-3.5 py-1.5 text-sm', sp.status === v && 'border-primary bg-primary/10')}>
            {l} <span className="text-muted-foreground">{counts.get(v) ?? 0}</span>
          </Link>
        ))}
        <Link href={href({ due: sp.due ? undefined : 'today' })} className={cn('rounded-full border border-border bg-card px-3.5 py-1.5 text-sm', sp.due && 'border-primary bg-primary/10')}>
          Follow-up due
        </Link>
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <Input name="q" defaultValue={sp.q} placeholder="Name, phone or lead no." className="max-w-xs" />
        <select name="service" defaultValue={sp.service ?? ''} className="h-10 rounded-xl border border-input bg-muted px-3 text-sm">
          <option value="">All services</option>
          {LEAD_SERVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="source" defaultValue={sp.source ?? ''} className="h-10 rounded-xl border border-input bg-muted px-3 text-sm">
          <option value="">All sources</option>
          {LEAD_SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="who" defaultValue={sp.who ?? ''} className="h-10 rounded-xl border border-input bg-muted px-3 text-sm">
          <option value="">Everyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {team?.filter((t) => t.id !== member.id).map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
        </select>
        <button className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">Filter</button>
      </form>

      {leads?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Travel</TableHead>
                <TableHead>Services</TableHead>
                <TableHead className="text-right">Pax</TableHead>
                <TableHead>Next follow-up</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => {
                const overdue = l.next_followup_at && new Date(l.next_followup_at) < new Date()
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link href={`/crm/leads/${l.id}`} className="font-medium hover:underline">{l.lead_no}</Link>
                      <div className="text-xs text-muted-foreground">{new Date(l.enquiry_date).toLocaleDateString('en-IN')}</div>
                    </TableCell>
                    <TableCell>
                      {l.guest_name}
                      <div className="text-xs text-muted-foreground">{l.phone}</div>
                    </TableCell>
                    <TableCell>
                      {l.travel_date_open ? 'Open' : l.travel_date && new Date(l.travel_date).toLocaleDateString('en-IN')}
                      {l.start_place && <div className="text-xs text-muted-foreground">from {l.start_place}</div>}
                    </TableCell>
                    <TableCell className="max-w-40 truncate">{(l.services as string[]).map((s) => label(LEAD_SERVICES, s)).join(', ')}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.adults + l.children_above_12 + l.children_6_12 + l.infants}</TableCell>
                    <TableCell className={overdue ? 'text-destructive' : undefined}>{l.next_followup_at ? istDateTime(l.next_followup_at) : '—'}</TableCell>
                    <TableCell><Badge variant={statusTone(l.status)}>{label(LEAD_STATUSES, l.status)}</Badge></TableCell>
                    <TableCell>{(l.org_members as unknown as { display_name: string } | null)?.display_name}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No leads match. Create one with “New lead”.</EmptyState>
      )}
    </>
  )
}
