import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { PrintButton } from '@/components/print-button'
import { docHref } from '@/components/statement'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Day book' }

type Row = { entry_date: string; doc_no: string; source_type: string; source_id: string; ledger_id: string; ledger_name: string; debit: number; credit: number; narration: string | null }

export default async function DayBookPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams
  const { supabase, org, fy } = await getContext()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const clamp = (v: string) => (v < fy.starts_on ? fy.starts_on : v > fy.ends_on ? fy.ends_on : v)
  const to = clamp(sp.to || today)
  const from = clamp(sp.from || to)
  const { data, error } = await supabase.rpc('day_book', { p_org: org.id, p_fy: fy.id, p_from: from, p_to: to })
  const rows = (data ?? []) as Row[]
  const dr = rows.reduce((s, r) => s + Number(r.debit), 0)
  const cr = rows.reduce((s, r) => s + Number(r.credit), 0)

  return (
    <>
      <PageHeader title="Day book" description="Every posted entry, voucher by voucher" actions={<PrintButton />} />
      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <label className="grid gap-1 text-xs text-muted-foreground">From<Input type="date" name="from" defaultValue={from} min={fy.starts_on} max={fy.ends_on} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">To<Input type="date" name="to" defaultValue={to} min={fy.starts_on} max={fy.ends_on} /></label>
        <button className="h-8 rounded-lg border px-3 text-sm hover:bg-muted">Show</button>
      </form>
      {error && <p className="mb-4 text-sm text-destructive">{error.message}</p>}
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const first = i === 0 || rows[i - 1].source_id !== r.source_id
                const href = docHref(r.source_type, r.source_id)
                return (
                  <TableRow key={i} className={first && i > 0 ? 'border-t-2' : undefined}>
                    <TableCell>{first && new Date(r.entry_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{first && (href ? <Link href={href} className="font-medium hover:underline">{r.doc_no}</Link> : <span className="font-medium">{r.doc_no}</span>)}</TableCell>
                    <TableCell className={r.credit ? 'pl-8' : undefined}>
                      <Link href={`/accounts/ledger?ledger=${r.ledger_id}&from=${from}&to=${to}`} className="hover:underline">{r.ledger_name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.narration}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.debit ? formatAmount(r.debit) : ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.credit ? formatAmount(r.credit) : ''}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(dr)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(cr)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : (
        <EmptyState>No entries on these dates.</EmptyState>
      )}
    </>
  )
}
