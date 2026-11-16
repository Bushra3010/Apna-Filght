import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { QUOTE_STATUSES } from '@/lib/quotation'
import { label } from '@/lib/leads'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Quotations' }

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const { supabase, org, fy } = await getContext()
  let q = supabase
    .from('quotations')
    .select('id, quote_no, quote_date, client_name, start_date, nights, adults, children, status, grand_total, markup, routes(name), ptitle:lookups!quotations_package_title_id_fkey(name)')
    .eq('org_id', org.id)
    .eq('fy_id', fy.id)
    .order('quote_date', { ascending: false })
    .order('quote_no', { ascending: false })
    .limit(200)
  if (status) q = q.eq('status', status)
  const { data: rows } = await q
  return (
    <>
      <PageHeader title="Quotations" description={`Holiday package proposals · FY ${fy.label}`} actions={<LinkButton href="/crm/quotations/new">New quotation</LinkButton>} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/crm/quotations" className={cn('rounded-full border border-border bg-card px-3.5 py-1.5 text-sm', !status && 'border-primary bg-primary/10')}>All</Link>
        {QUOTE_STATUSES.map(([v, l]) => (
          <Link key={v} href={`/crm/quotations?status=${v}`} className={cn('rounded-full border border-border bg-card px-3.5 py-1.5 text-sm', status === v && 'border-primary bg-primary/10')}>{l}</Link>
        ))}
      </div>
      {rows?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Quotation</TableHead><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Package</TableHead><TableHead>Travel</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Margin</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/crm/quotations/${r.id}`} className="font-medium hover:underline">{r.quote_no}</Link></TableCell>
                  <TableCell>{new Date(r.quote_date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{r.client_name}<span className="block text-xs text-muted-foreground">{r.adults + r.children} pax</span></TableCell>
                  <TableCell>{(r.ptitle as unknown as { name: string } | null)?.name ?? (r.routes as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell>{r.start_date && new Date(r.start_date).toLocaleDateString('en-IN')}{r.nights !== null && <span className="block text-xs text-muted-foreground">{r.nights}N</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.grand_total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.markup)}</TableCell>
                  <TableCell><Badge variant={r.status === 'accepted' ? 'default' : r.status === 'rejected' ? 'outline' : 'secondary'}>{label(QUOTE_STATUSES, r.status)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No quotations yet.</EmptyState>
      )}
    </>
  )
}
