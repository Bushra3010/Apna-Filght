import Link from 'next/link'
import { Plus, ReceiptIndianRupee, Users } from 'lucide-react'
import { getContext } from '@/lib/context'
import { formatINR } from '@/lib/money'
import { LinkButton } from '@/components/link-button'
import { AgeingBars, MonthlySalesChart } from '@/components/charts'
import { DeltaChip, Panel, Tile } from '@/components/tile'
import { MonthCalendar, type CalEvent } from '@/components/month-calendar'

export const metadata = { title: 'Dashboard' }

type Summary = { sales: number; margin: number; receivable: number; receipts: number; open_leads: number; followups_due: number }

const ist = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export default async function DashboardPage() {
  const { supabase, org, fy } = await getContext()
  const today = ist()
  const [y, m] = today.split('-').map(Number)
  const monthStart = `${today.slice(0, 7)}-01`
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const weekAgo = new Date(Date.parse(today) - 7 * 86400000).toISOString().slice(0, 10)

  const [
    { data: summary }, { data: recent }, { data: due }, { data: monthly }, { data: ageing },
    { count: invoiceCount }, { count: receiptCount }, { count: newLeads }, { data: payables },
    { data: calFollow }, { data: calLeads }, { data: calTrips },
  ] = await Promise.all([
    supabase.rpc('dashboard_summary', { p_org: org.id, p_fy: fy.id }),
    supabase.from('invoices').select('id, invoice_no, invoice_date, total, ledgers!invoices_party_ledger_id_fkey(name)')
      .eq('org_id', org.id).eq('fy_id', fy.id).eq('doc_kind', 'invoice').order('created_at', { ascending: false }).limit(5),
    supabase.from('lead_followups').select('id, action, due_at, leads(id, lead_no, guest_name)')
      .eq('org_id', org.id).is('done_at', null).order('due_at').limit(5),
    supabase.rpc('monthly_sales', { p_org: org.id, p_fy: fy.id }),
    supabase.rpc('receivable_ageing', { p_org: org.id }),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('fy_id', fy.id).eq('doc_kind', 'invoice').eq('status', 'posted'),
    supabase.from('vouchers').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('fy_id', fy.id).eq('kind', 'receipt'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org.id).gte('enquiry_date', weekAgo),
    supabase.rpc('party_outstanding', { p_org: org.id, p_fy: fy.id, p_as_of: today < fy.ends_on ? today : fy.ends_on, p_kind: 'supplier' }),
    supabase.from('lead_followups').select('due_at, action, leads(guest_name)').eq('org_id', org.id).is('done_at', null)
      .gte('due_at', `${monthStart}T00:00:00+05:30`).lte('due_at', `${monthEnd}T23:59:59+05:30`),
    supabase.from('leads').select('travel_date, guest_name').eq('org_id', org.id).gte('travel_date', monthStart).lte('travel_date', monthEnd)
      .not('status', 'in', '(booked,not_interested,fake)'),
    supabase.from('invoice_lines').select('travel_date, pax_name, invoices!inner(status, doc_kind)').eq('org_id', org.id)
      .gte('travel_date', monthStart).lte('travel_date', monthEnd).eq('invoices.status', 'posted').eq('invoices.doc_kind', 'invoice'),
  ])

  const s = (summary ?? {}) as Summary
  const months = ((monthly ?? []) as { month: string; sales: number; margin: number }[]).map((x) => ({
    key: x.month.slice(0, 7),
    label: new Date(x.month + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    sales: Number(x.sales),
    margin: Number(x.margin),
  }))
  const cur = Math.max(0, months.findIndex((x) => x.key === today.slice(0, 7)))
  const thisMonth = months[cur]?.sales ?? 0
  const lastMonth = months[cur - 1]?.sales ?? 0
  const growth = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null
  const buckets = ((ageing ?? []) as { bucket: string; amount: number; invoices: number }[]).map((b) => ({ ...b, amount: Number(b.amount), invoices: Number(b.invoices) }))
  const openBills = buckets.reduce((a, b) => a + b.invoices, 0)
  const sup = (payables ?? []) as { balance: number; open_bills: number }[]
  const payable = sup.reduce((a, r) => a + Math.max(Number(r.balance), 0), 0)
  const marginPct = s.sales ? Math.round((Number(s.margin) / Number(s.sales)) * 100) : 0
  const avgInvoice = invoiceCount ? Math.round(Number(s.sales) / invoiceCount) : 0
  const avgMargin = invoiceCount ? Math.round(Number(s.margin) / invoiceCount) : 0

  const istDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const events: CalEvent[] = [
    ...(calFollow ?? []).map((f) => ({ date: istDate(f.due_at), kind: 'followup' as const, label: `Follow-up: ${(f.leads as unknown as { guest_name: string } | null)?.guest_name ?? ''}` })),
    ...(calLeads ?? []).map((l) => ({ date: l.travel_date as string, kind: 'travel' as const, label: `Lead travels: ${l.guest_name}` })),
    ...(calTrips ?? []).map((t) => ({ date: t.travel_date as string, kind: 'trip' as const, label: `Trip: ${t.pax_name ?? ''}` })),
  ]
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' })

  return (
    <div className="grid gap-6">
      {/* title + headline figures */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">{org.name} · FY {fy.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-6 md:gap-10">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-card text-muted-foreground"><ReceiptIndianRupee className="size-5" /></span>
            <div>
              <p className="flex items-center gap-2 text-2xl font-bold tabular-nums md:text-3xl">
                {formatINR(thisMonth).replace(/\.00$/, '')}
                {growth !== null && <DeltaChip down={growth < 0}>{growth >= 0 ? '+' : ''}{growth}% month</DeltaChip>}
              </p>
              <p className="text-xs text-muted-foreground">Sales this month</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-card text-muted-foreground"><Users className="size-5" /></span>
            <div>
              <p className="flex items-center gap-2 text-2xl font-bold tabular-nums md:text-3xl">
                {s.open_leads ?? 0}
                <DeltaChip>+{newLeads ?? 0} this week</DeltaChip>
              </p>
              <p className="text-xs text-muted-foreground">Open leads</p>
            </div>
          </div>
        </div>
      </div>

      {/* overview tiles + calendar */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Overview" count={6}>
          <div className="grid gap-3 sm:grid-cols-[56px_1fr]">
            <Link href="/billing/invoices/new" aria-label="New invoice" className="hidden items-center justify-center rounded-3xl bg-muted/70 text-primary transition-colors hover:bg-muted sm:flex">
              <Plus className="size-6" />
            </Link>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Tile tone="blue" tag="Billing" title="Sales" sub={`Invoices: ${invoiceCount ?? 0}`} value={formatINR(s.sales).replace(/\.00$/, '')} href="/reports/sales-register" />
              <Tile tone="orange" tag="Profit" title="Margin" sub={`Margin: ${marginPct}%`} value={formatINR(s.margin).replace(/\.00$/, '')} href="/reports/sales-register" />
              <Tile tone="purple" tag="Collections" title="Receivable" sub={`Open bills: ${openBills}`} value={formatINR(s.receivable).replace(/\.00$/, '')} href="/reports/outstanding" />
              <Tile tone="green" tag="Bank" title="Received" sub={`Receipts: ${receiptCount ?? 0}`} value={formatINR(s.receipts).replace(/\.00$/, '')} href="/vouchers/receipts" />
              <Tile tone="red" tag="CRM" title="Follow-ups" sub={`Due now: ${s.followups_due ?? 0}`} value={String(s.followups_due ?? 0)} href="/crm/leads?due=today" />
              <Tile tone="cyan" tag="Suppliers" title="Payable" sub={`Suppliers: ${sup.filter((r) => Number(r.balance) > 0).length}`} value={formatINR(payable).replace(/\.00$/, '')} href="/reports/outstanding?side=payable" />
            </div>
          </div>
        </Panel>
        <Panel title="Calendar" count={monthName} href="/crm/leads">
          <MonthCalendar year={y} month={m - 1} today={today} events={events} />
        </Panel>
      </div>

      {/* averages + monthly chart */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title="This year" href="/reports/sales-register">
          <div className="grid gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Average invoice value</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight text-primary tabular-nums">{formatINR(avgInvoice).replace(/\.00$/, '')}</span>
                <span className="text-xs text-muted-foreground">over {invoiceCount ?? 0} invoices</span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average margin per invoice</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight text-primary tabular-nums">{formatINR(avgMargin).replace(/\.00$/, '')}</span>
                <span className="text-xs text-muted-foreground">{marginPct}% of sales</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/crm/leads/new" variant="outline">New lead</LinkButton>
              <LinkButton href="/billing/invoices/new">New invoice</LinkButton>
            </div>
          </div>
        </Panel>
        <Panel title="Monthly sales" count={`${marginPct}%`} href="/reports/sales-register">
          <MonthlySalesChart months={months} current={cur} />
        </Panel>
      </div>

      {/* lists */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Recent invoices" href="/billing/invoices">
          {recent?.length ? (
            <ul className="grid gap-2 text-sm">
              {recent.map((i) => (
                <li key={i.id}>
                  <Link href={`/billing/invoices/${i.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3 hover:bg-muted">
                    <span className="min-w-0 truncate"><span className="font-semibold">{i.invoice_no}</span> <span className="text-muted-foreground">· {(i.ledgers as unknown as { name: string } | null)?.name}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatINR(i.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          )}
        </Panel>
        <Panel title="Follow-ups" href="/crm/leads?due=today">
          {due?.length ? (
            <ul className="grid gap-2 text-sm">
              {due.map((f) => {
                const l = f.leads as unknown as { id: string; lead_no: string; guest_name: string }
                const late = f.due_at < new Date().toISOString()
                return (
                  <li key={f.id}>
                    <Link href={`/crm/leads/${l.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3 hover:bg-muted">
                      <span className="min-w-0 truncate"><span className="font-semibold">{l.guest_name}</span> <span className="text-muted-foreground">· {f.action.replace('_', ' ')}</span></span>
                      <span className={late ? 'shrink-0 text-xs font-semibold text-destructive' : 'shrink-0 text-xs text-muted-foreground'}>
                        {new Date(f.due_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          )}
        </Panel>
        <Panel title="Receivable ageing" href="/reports/outstanding">
          <AgeingBars buckets={buckets} />
        </Panel>
      </div>
    </div>
  )
}
