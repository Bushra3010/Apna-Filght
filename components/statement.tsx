import 'server-only'
import Link from 'next/link'
import { getContext, fyRange } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { PrintButton } from '@/components/print-button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Row = { entry_date: string; doc_no: string; source_type: string | null; source_id: string | null; narration: string | null; debit: number | null; credit: number | null; balance: number }

export const drcr = (n: number) => (n === 0 ? '0.00' : `${formatAmount(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`)

export function docHref(type: string | null, id: string | null) {
  if (!id) return null
  if (type === 'invoice') return `/billing/invoices/${id}`
  if (type === 'purchase_bill') return `/purchase/general/${id}`
  return null
}

/** Ledger statement with opening and running balance. `kinds` limits the ledger picker (cash book, bank book). */
export async function Statement({
  title,
  kinds,
  sp,
}: {
  title: string
  kinds?: string[]
  sp: { ledger?: string; from?: string; to?: string }
}) {
  const { supabase, org, fy } = await getContext()
  const from = sp.from || fy.starts_on
  const to = sp.to || fyRange(fy).to

  let q = supabase.from('ledgers').select('id, name, kind').eq('org_id', org.id).order('name')
  if (kinds) q = q.in('kind', kinds)
  const { data: ledgers } = await q
  const selected = ledgers?.find((l) => l.id === sp.ledger) ?? (kinds && ledgers?.length === 1 ? ledgers[0] : undefined)

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
  const d = (v: string) => new Date(v).toLocaleDateString('en-IN')

  return (
    <>
      <PageHeader
        title={title}
        description={selected ? `${selected.name} · ${d(from)} to ${d(to)}` : `FY ${fy.label}`}
        actions={selected ? <PrintButton /> : undefined}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <label className="grid gap-1 text-xs text-muted-foreground">
          {kinds?.includes('cash') ? 'Cash account' : kinds?.includes('bank') ? 'Bank account' : 'Ledger'}
          <select name="ledger" defaultValue={selected?.id ?? ''} className="h-10 min-w-60 rounded-xl border border-input bg-muted px-3 text-sm text-foreground" required>
            <option value="" disabled>Select</option>
            {ledgers?.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{kinds ? '' : ` (${l.kind})`}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">From<Input type="date" name="from" defaultValue={from} min={fy.starts_on} max={fy.ends_on} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">To<Input type="date" name="to" defaultValue={to} min={fy.starts_on} max={fy.ends_on} /></label>
        <button className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">Show</button>
      </form>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {!selected ? (
        <EmptyState>{ledgers?.length ? 'Choose an account to see its statement.' : 'No accounts of this type yet. Add one under Ledgers.'}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-card">
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
                const href = docHref(r.source_type, r.source_id)
                return (
                  <TableRow key={i} className={i === 0 ? 'bg-muted/40 font-medium' : undefined}>
                    <TableCell>{d(r.entry_date)}</TableCell>
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
