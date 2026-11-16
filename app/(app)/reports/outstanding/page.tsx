import Link from 'next/link'
import { getContext, fyRange } from '@/lib/context'
import { clampToFy } from '@/lib/reports'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { PeriodForm } from '@/components/period-form'
import { CsvButton } from '@/components/csv-button'
import { PrintButton } from '@/components/print-button'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Outstanding' }

type Row = { ledger_id: string; ledger_name: string; mobile: string | null; credit_days: number; balance: number; not_due: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; open_bills: number }

export default async function OutstandingPage({ searchParams }: { searchParams: Promise<{ side?: string; to?: string }> }) {
  const sp = await searchParams
  const side = sp.side === 'payable' ? 'payable' : 'receivable'
  const { supabase, org, fy } = await getContext()
  const to = clampToFy(fy, sp.to, fyRange(fy).to)
  const { data, error } = await supabase.rpc('party_outstanding', { p_org: org.id, p_fy: fy.id, p_as_of: to, p_kind: side === 'payable' ? 'supplier' : 'customer' })
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, balance: Number(r.balance) }))
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + Number(r[k]), 0)
  const owe = rows.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0)
  const adv = rows.filter((r) => r.balance < 0).reduce((s, r) => s - r.balance, 0)

  return (
    <>
      <PageHeader
        title={side === 'payable' ? 'Payables' : 'Receivables'}
        description={`As on ${new Date(to).toLocaleDateString('en-IN', { dateStyle: 'medium' })} · balance from the accounts, ageing from open bills`}
        actions={<><CsvButton tableId="outstanding" filename={`${side}-${to}`} /><PrintButton /></>}
      />
      <div className="mb-4 flex flex-wrap gap-1.5 print:hidden">
        {(['receivable', 'payable'] as const).map((s) => (
          <Link key={s} href={`/reports/outstanding?side=${s}&to=${to}`} className={cn('rounded-lg border px-2.5 py-1 text-sm capitalize', side === s && 'border-primary bg-primary/10')}>{s}</Link>
        ))}
      </div>
      <PeriodForm to={to} min={fy.starts_on} max={fy.ends_on} asOn extra={{ side }} />
      {error && <p className="mb-4 text-sm text-destructive">{error.message}</p>}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{side === 'payable' ? 'You owe' : 'Owed to you'}</p><p className="text-lg font-semibold tabular-nums">{formatAmount(owe)}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Advances</p><p className="text-lg font-semibold tabular-nums">{formatAmount(adv)}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Over 60 days</p><p className="text-lg font-semibold tabular-nums">{formatAmount(sum('d61_90') + sum('d90_plus'))}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Parties</p><p className="text-lg font-semibold tabular-nums">{rows.length}</p></div>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <table id="outstanding" className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Party</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Not due</th>
                <th className="px-3 py-2 text-right font-medium">1–30 days</th>
                <th className="px-3 py-2 text-right font-medium">31–60</th>
                <th className="px-3 py-2 text-right font-medium">61–90</th>
                <th className="px-3 py-2 text-right font-medium">90+</th>
                <th className="px-3 py-2 text-right font-medium">Bills</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ledger_id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/accounts/ledger?ledger=${r.ledger_id}&to=${to}`} className="font-medium hover:underline">{r.ledger_name}</Link>
                    {r.mobile && <span className="block text-xs text-muted-foreground">{r.mobile}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatAmount(Math.abs(r.balance))}{r.balance < 0 && <span className="text-xs text-muted-foreground"> adv</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.not_due) ? formatAmount(r.not_due) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.d1_30) ? formatAmount(r.d1_30) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.d31_60) ? formatAmount(r.d31_60) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.d61_90) ? formatAmount(r.d61_90) : ''}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', Number(r.d90_plus) && 'text-destructive')}>{Number(r.d90_plus) ? formatAmount(r.d90_plus) : ''}</td>
                  <td className="px-3 py-2 text-right">{Number(r.open_bills) > 0 && <Link href={`/reports/bills?party=${r.ledger_id}&side=${side}`} className="text-primary hover:underline">{r.open_bills}</Link>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(sum('balance'))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(sum('not_due'))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(sum('d1_30'))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(sum('d31_60'))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(sum('d61_90'))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatAmount(sum('d90_plus'))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <EmptyState>Nothing outstanding.</EmptyState>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Balance is the party’s account balance on the date. Ageing uses bills that are still open today; receipts or payments kept on account reduce the balance but not the ageing until you <Link href="/vouchers/adjust" className="underline">adjust them against bills</Link>.
      </p>
    </>
  )
}
