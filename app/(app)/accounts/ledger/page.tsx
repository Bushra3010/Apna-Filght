import Link from 'next/link'
import { getContext, fyRange } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { PrintButton } from '@/components/print-button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Ledger statement' }

type Row = { entry_date: string; doc_no: string; source_type: string | null; source_id: string | null; narration: string | null; debit: number | null; credit: number | null; balance: number }

const drcr = (n: number) => (n === 0 ? '0.00' : `${formatAmount(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`)
const docHref = (r: Row) => (r.source_type === 'invoice' ? `/billing/invoices/${r.source_id}` : null)

export default async function LedgerStatementPage({ searchParams }: { searchParams: Promise<{ ledger?: string; from?: string; to?: string }> }) {
  const sp = await searchParams
  const { supabase, org, fy } = await getContext()
  const def = fyRange(fy)
  const from = sp.from || fy.starts_on
  const to = sp.to || def.to

  const { data: ledgers } = await supabase.from('ledgers').select('id, name, kind').eq('org_id', org.id).order('name')
  const selected = ledgers?.find((l) => l.id === sp.ledger)

  let rows: Row[] = []
  let error: string | undefined
  if (selected) {
    const res = await supabase.rpc('ledger_statement', { p_org: org.id, p_fy: fy.id, p_ledger: selected.id, p_from: from, p_to: to })
    rows = (res.data ?? []) as Row[]
    error = res.error?.message
  }
  const dr = rows.reduce((s, r) => s + Number(r.debit ?? 0), 0)
  const cr = rows.reduce((s, r) => s + Number(r.credit ?? 0), 0)
  const closing = rows.length ? Number(rows[rows.length - 1].balance) : 0

  return (
    <>
      <PageHeader title="Ledger statement" description={selected ? `${selected.name} · ${new Date(from).toLocaleDateString('en-IN')} to ${new Date(to).toLocaleDateString('en-IN')}` : `FY ${fy.label}`} actions={selected ? <PrintButton /> : undefined} />
      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Ledger
          <select name="ledger" defaultValue={sp.ledger ?? ''} className="h-8 min-w-60 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground" required>
            <option value="" disabled>Select ledger</option>
            {ledgers?.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.kind})</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">From<Input type="date" name="from" defaultValue={from} min={fy.starts_on} max={fy.ends_on} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">To<Input type="date" name="to" defaultValue={to} min={fy.starts_on} max={fy.ends_on} /></label>
        <button className="h-8 rounded-lg border px-3 text-sm hover:bg-muted">Show</button>
      </form>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {!selected ? (
        <EmptyState>Choose a ledger to see its statement.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const href = docHref(r)
                return (
                  <TableRow key={i} className={i === 0 ? 'bg-muted/40 font-medium' : undefined}>
                    <TableCell>{new Date(r.entry_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{href ? <Link href={href} className="hover:underline">{r.doc_no}</Link> : r.doc_no}</TableCell>
                    <TableCell className="capitalize">{r.source_type?.replace('_', ' ')}</TableCell>
                    <TableCell>{r.narration}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.debit ? formatAmount(r.debit) : ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.credit ? formatAmount(r.credit) : ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{drcr(Number(r.balance))}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Closing balance</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(dr)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(cr)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{drcr(closing)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </>
  )
}
