import Link from 'next/link'
import { getTrialBalance } from '@/lib/reports'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { PrintButton } from '@/components/print-button'
import { PeriodForm } from '@/components/period-form'
import { drcr } from '@/components/statement'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Trial balance' }

export default async function TrialBalancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams
  const { rows, from, to, fy } = await getTrialBalance(sp.from, sp.to)

  type G = { id: string; name: string; opening: number; debit: number; credit: number; closing: number; ledgers: typeof rows }
  const groups: G[] = []
  for (const r of rows) {
    let g = groups.find((x) => x.id === r.top_group_id)
    if (!g) groups.push((g = { id: r.top_group_id, name: r.top_group_name, opening: 0, debit: 0, credit: 0, closing: 0, ledgers: [] }))
    g.opening += r.opening
    g.debit += r.debit
    g.credit += r.credit
    g.closing += r.closing
    g.ledgers.push(r)
  }
  const tot = rows.reduce((a, r) => ({ dr: a.dr + Math.max(r.closing, 0), cr: a.cr + Math.max(-r.closing, 0), d: a.d + r.debit, c: a.c + r.credit }), { dr: 0, cr: 0, d: 0, c: 0 })
  const d = (v: string) => new Date(v).toLocaleDateString('en-IN')
  const balanced = tot.dr === tot.cr

  return (
    <>
      <PageHeader title="Trial balance" description={`${d(from)} to ${d(to)} · FY ${fy.label}`} actions={<PrintButton />} />
      <PeriodForm from={from} to={to} min={fy.starts_on} max={fy.ends_on} />
      {!rows.length ? (
        <EmptyState>No balances yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Particulars</th>
                <th className="px-3 py-2 text-right font-medium">Opening</th>
                <th className="px-3 py-2 text-right font-medium">Debit</th>
                <th className="px-3 py-2 text-right font-medium">Credit</th>
                <th className="px-3 py-2 text-right font-medium">Closing Dr</th>
                <th className="px-3 py-2 text-right font-medium">Closing Cr</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.id} className="border-b">
                <tr className="bg-muted/40 font-medium">
                  <td className="px-3 py-2">{g.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{drcr(g.opening)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(g.debit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(g.credit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.closing > 0 ? formatAmount(g.closing) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.closing < 0 ? formatAmount(-g.closing) : ''}</td>
                </tr>
                {g.ledgers.map((l) => (
                  <tr key={l.ledger_id} className="text-muted-foreground hover:bg-muted/30">
                    <td className="px-3 py-1.5 pl-8">
                      <Link href={`/accounts/ledger?ledger=${l.ledger_id}&from=${from}&to=${to}`} className="hover:text-foreground hover:underline">{l.ledger_name}</Link>
                      {l.group_name !== g.name && <span className="ml-2 text-xs">({l.group_name})</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.opening ? drcr(l.opening) : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.debit ? formatAmount(l.debit) : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.credit ? formatAmount(l.credit) : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.closing > 0 ? formatAmount(l.closing) : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.closing < 0 ? formatAmount(-l.closing) : ''}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-2">Total</td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(tot.d)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(tot.c)}</td>
                <td className={cn('px-3 py-2 text-right tabular-nums', !balanced && 'text-destructive')}>{formatAmount(tot.dr)}</td>
                <td className={cn('px-3 py-2 text-right tabular-nums', !balanced && 'text-destructive')}>{formatAmount(tot.cr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {rows.length > 0 && !balanced && (
        <p className="mt-3 text-sm text-destructive">
          Debit and credit differ by {formatAmount(Math.abs(tot.dr - tot.cr))}. This comes from opening balances that don’t balance — fix them under Opening balances.
        </p>
      )}
    </>
  )
}
