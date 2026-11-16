import { getTrialBalance } from '@/lib/reports'
import { profitAndLoss } from '@/lib/statements'
import { formatINR } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { PrintButton } from '@/components/print-button'
import { PeriodForm } from '@/components/period-form'
import { StatementSide } from '@/components/statement-side'

export const metadata = { title: 'Profit & loss' }

export default async function ProfitLossPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams
  const { rows, from, to, fy } = await getTrialBalance(sp.from, sp.to)
  const pl = profitAndLoss(rows)
  const sum = (s: { total: number }[]) => s.reduce((a, x) => a + x.total, 0)
  const d = (v: string) => new Date(v).toLocaleDateString('en-IN')
  // two-sided layout: trading account on top, profit & loss below
  const tradingLeft = sum(pl.directExpense) + Math.max(pl.gross, 0)
  const tradingRight = sum(pl.directIncome) + Math.max(-pl.gross, 0)
  const plLeft = sum(pl.indirectExpense) + Math.max(-pl.gross, 0) + Math.max(pl.net, 0)
  const plRight = sum(pl.indirectIncome) + Math.max(pl.gross, 0) + Math.max(-pl.net, 0)

  return (
    <>
      <PageHeader title="Profit & loss" description={`${d(from)} to ${d(to)} · FY ${fy.label}`} actions={<PrintButton />} />
      <PeriodForm from={from} to={to} min={fy.starts_on} max={fy.ends_on} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Gross profit</p><p className="text-lg font-semibold tabular-nums">{formatINR(pl.gross)}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{pl.net >= 0 ? 'Net profit' : 'Net loss'}</p><p className={pl.net < 0 ? 'text-lg font-semibold text-destructive tabular-nums' : 'text-lg font-semibold tabular-nums'}>{formatINR(Math.abs(pl.net))}</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSide title="Expenses — trading" sections={pl.directExpense} from={from} to={to} total={tradingLeft}
          extra={pl.gross > 0 ? [{ label: 'Gross profit c/o', amount: pl.gross }] : []} />
        <StatementSide title="Income — trading" sections={pl.directIncome} from={from} to={to} total={tradingRight}
          extra={pl.gross < 0 ? [{ label: 'Gross loss c/o', amount: -pl.gross, tone: 'bad' }] : []} />
        <StatementSide title="Expenses" sections={pl.indirectExpense} from={from} to={to} total={plLeft}
          extra={[...(pl.gross < 0 ? [{ label: 'Gross loss b/f', amount: -pl.gross, tone: 'bad' as const }] : []), ...(pl.net > 0 ? [{ label: 'Net profit', amount: pl.net }] : [])]} />
        <StatementSide title="Income" sections={pl.indirectIncome} from={from} to={to} total={plRight}
          extra={[...(pl.gross > 0 ? [{ label: 'Gross profit b/f', amount: pl.gross }] : []), ...(pl.net < 0 ? [{ label: 'Net loss', amount: -pl.net, tone: 'bad' as const }] : [])]} />
      </div>
    </>
  )
}
