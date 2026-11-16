import { getContext } from '@/lib/context'
import { getTrialBalance } from '@/lib/reports'
import { balanceSheet } from '@/lib/statements'
import { formatAmount } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { PrintButton } from '@/components/print-button'
import { PeriodForm } from '@/components/period-form'
import { StatementSide } from '@/components/statement-side'

export const metadata = { title: 'Balance sheet' }

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const sp = await searchParams
  const { fy } = await getContext()
  const { rows, to } = await getTrialBalance(fy.starts_on, sp.to)
  const bs = balanceSheet(rows)
  return (
    <>
      <PageHeader title="Balance sheet" description={`As on ${new Date(to).toLocaleDateString('en-IN', { dateStyle: 'medium' })} · FY ${fy.label}`} actions={<PrintButton />} />
      <PeriodForm to={to} min={fy.starts_on} max={fy.ends_on} asOn />
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSide title="Liabilities & capital" sections={bs.liabilities} from={fy.starts_on} to={to} total={bs.totalLiab}
          extra={[{ label: bs.profit >= 0 ? 'Profit for the year (to date)' : 'Loss for the year (to date)', amount: bs.profit, tone: bs.profit < 0 ? 'bad' : undefined }]} />
        <StatementSide title="Assets" sections={bs.assets} from={fy.starts_on} to={to} total={bs.totalAssets} />
      </div>
      {bs.diff !== 0 && (
        <p className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Assets and liabilities differ by {formatAmount(Math.abs(bs.diff))} because the opening balances don’t balance. Fix them under Accounts → Opening balances.
        </p>
      )}
    </>
  )
}
