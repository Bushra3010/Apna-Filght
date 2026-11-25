import Link from 'next/link'
import { getContext } from '@/lib/context'
import { todayIST } from '@/lib/dates'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LEAD_SERVICES, LEAD_SOURCES, LEAD_STATUSES, LEAD_VIEWS, istDateTime, label, statusTone } from '@/lib/leads'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Leads' }

type SP = { view?: string; status?: string; service?: string; source?: string; q?: string; due?: string; who?: string }

const chip = 'rounded-full border border-border bg-card px-3.5 py-1.5 text-sm'
const chipOn = 'border-primary bg-primary/10'
const select = 'h-10 rounded-xl border border-input bg-muted px-3 text-sm'

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { supabase, org, member } = await getContext()
  const { data: team } = await supabase.from('org_members').select('id, display_name').eq('org_id', org.id).eq('is_active', true).order('display_name')
  const view = LEAD_VIEWS.find((v) => v.key === sp.view)

  let query = supabase
    .from('leads')
    .select('id, lead_no, guest_name, phone, start_place, travel_date, travel_date_open, services, adults, children_above_12, children_6_12, infants, status, next_followup_at')
    .eq('org_id', org.id)
    .order('enquiry_date', { ascending: false })
    .order('lead_no', { ascending: false })
    .limit(100)
  if (sp.status) query = query.eq('status', sp.status)
  else if (view) query = query.in('status', [...view.statuses])
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
  const countOf = (statuses: readonly string[]) => all?.filter((r) => statuses.includes(r.status)).length ?? 0

  // The tabs are the main way to narrow the list, so picking one clears the other tab choices.
  const tab = (patch: Partial<SP>) => {
    const p = new URLSearchParams(
      Object.entries({ ...sp, view: undefined, status: undefined, due: undefined, ...patch }).filter(([, v]) => v) as [string, string][],
    )
    return `/crm/leads${p.size ? `?${p}` : ''}`
  }
  const moreOpen = Boolean(sp.status || sp.service || sp.source || sp.who)
  const filtered = Boolean(moreOpen || sp.q || sp.view || sp.due)

  return (
    <>
      <PageHeader title="Leads" description="Customer enquiries and who to call next" actions={<LinkButton href="/crm/leads/new">+ New lead</LinkButton>} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href={tab({})} className={cn(chip, !sp.view && !sp.status && !sp.due && chipOn)}>
          All <span className="text-muted-foreground">{all?.length ?? 0}</span>
        </Link>
        <Link href={tab({ due: 'today' })} className={cn(chip, sp.due && chipOn)}>
          Call today
        </Link>
        {LEAD_VIEWS.map((v) => (
          <Link key={v.key} href={tab({ view: v.key })} className={cn(chip, sp.view === v.key && !sp.status && chipOn)}>
            {v.label} <span className="text-muted-foreground">{countOf(v.statuses)}</span>
          </Link>
        ))}
      </div>

      <form className="mb-4 grid gap-2">
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        {sp.due && <input type="hidden" name="due" value={sp.due} />}
        <div className="flex flex-wrap gap-2">
          <Input name="q" defaultValue={sp.q} placeholder="Search name or phone" className="max-w-xs" />
          <button className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">Search</button>
          {filtered && (
            <Link href="/crm/leads" className="flex h-10 items-center px-2 text-sm text-muted-foreground hover:underline">Clear</Link>
          )}
        </div>
        <details open={moreOpen} className="text-sm">
          <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">More filters</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <select name="status" defaultValue={sp.status ?? ''} className={select}>
              <option value="">Any stage</option>
              {LEAD_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select name="service" defaultValue={sp.service ?? ''} className={select}>
              <option value="">All services</option>
              {LEAD_SERVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select name="source" defaultValue={sp.source ?? ''} className={select}>
              <option value="">All sources</option>
              {LEAD_SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select name="who" defaultValue={sp.who ?? ''} className={select}>
              <option value="">Everyone&apos;s leads</option>
              <option value="me">My leads</option>
              <option value="none">Not assigned</option>
              {team?.filter((t) => t.id !== member.id).map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
            </select>
          </div>
        </details>
      </form>

      {leads?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Trip</TableHead>
                <TableHead>Next call</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => {
                const overdue = l.next_followup_at && new Date(l.next_followup_at) < new Date()
                const pax = l.adults + l.children_above_12 + l.children_6_12 + l.infants
                const when = l.travel_date_open || !l.travel_date ? 'Date not fixed' : new Date(l.travel_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link href={`/crm/leads/${l.id}`} className="font-medium hover:underline">{l.guest_name}</Link>
                      <div className="text-xs text-muted-foreground">{l.phone} · {l.lead_no}</div>
                    </TableCell>
                    <TableCell>
                      {(l.services as string[]).map((s) => label(LEAD_SERVICES, s)).join(', ') || '—'}
                      <div className="text-xs text-muted-foreground">
                        {[when, l.start_place && `from ${l.start_place}`, `${pax} ${pax === 1 ? 'person' : 'people'}`].filter(Boolean).join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell className={overdue ? 'text-destructive' : undefined}>
                      {l.next_followup_at ? istDateTime(l.next_followup_at) : '—'}
                      {overdue && <div className="text-xs">Overdue</div>}
                    </TableCell>
                    <TableCell><Badge variant={statusTone(l.status)}>{label(LEAD_STATUSES, l.status)}</Badge></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>{filtered ? 'No leads found here.' : 'No leads yet. Add your first one with “+ New lead”.'}</EmptyState>
      )}
    </>
  )
}
