import Link from 'next/link'
import { getContext, fyRange } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Invoices' }

type SP = { from?: string; to?: string; pay?: string; party?: string }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { supabase, org, fy } = await getContext()
  const range = fyRange(fy)
  const from = sp.from || fy.starts_on
  const to = sp.to || fy.ends_on

  let q = supabase
    .from('v_invoice_balance')
    .select('id, invoice_no, invoice_date, due_date, bill_type, party_ledger_id, total, allocated, balance, pay_status')
    .eq('org_id', org.id)
    .eq('doc_kind', 'invoice')
    .gte('invoice_date', from)
    .lte('invoice_date', to)
    .order('invoice_date', { ascending: false })
    .order('invoice_no', { ascending: false })
    .limit(200)
  if (sp.pay) q = q.eq('pay_status', sp.pay)
  if (sp.party) q = q.eq('party_ledger_id', sp.party)
  const { data: rows } = await q

  const ids = [...new Set(rows?.map((r) => r.party_ledger_id))]
  const { data: parties } = ids.length
    ? await supabase.from('ledgers').select('id, name').in('id', ids)
    : { data: [] as { id: string; name: string }[] }
  const name = new Map(parties?.map((p) => [p.id, p.name]))
  const sum = (k: 'total' | 'balance') => rows?.reduce((a, r) => a + Number(r[k]), 0) ?? 0
  const today = range.to

  return (
    <>
      <PageHeader title="Invoices" description={`FY ${fy.label}`} actions={<LinkButton href="/billing/invoices/new">New invoice</LinkButton>} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">From<Input type="date" name="from" defaultValue={from} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">To<Input type="date" name="to" defaultValue={to} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Payment
          <select name="pay" defaultValue={sp.pay ?? ''} className="h-10 rounded-xl border border-input bg-muted px-3 text-sm text-foreground">
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <button className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">Filter</button>
      </form>
      {rows?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const overdue = r.pay_status !== 'paid' && r.due_date && r.due_date < today
                return (
                  <TableRow key={r.id}>
                    <TableCell><Link href={`/billing/invoices/${r.id}`} className="font-medium hover:underline">{r.invoice_no}</Link></TableCell>
                    <TableCell>{new Date(r.invoice_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{name.get(r.party_ledger_id)}</TableCell>
                    <TableCell className="capitalize">{r.bill_type.replace('_', ' ')}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(r.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(r.balance)}</TableCell>
                    <TableCell>
                      <Badge variant={r.pay_status === 'paid' ? 'default' : overdue ? 'destructive' : 'outline'}>
                        {overdue ? 'overdue' : r.pay_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>{rows.length} invoices</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(sum('total'))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(sum('balance'))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : (
        <EmptyState>No invoices in this period.</EmptyState>
      )}
    </>
  )
}
