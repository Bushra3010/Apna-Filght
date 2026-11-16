import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { carryForward, closeYear, createNextYear, reopenYear, switchYear } from './actions'

export const metadata = { title: 'Financial years' }

export default async function YearsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams
  const { fy, years } = await getContext()
  const sorted = [...years].sort((a, b) => b.starts_on.localeCompare(a.starts_on))
  const d = (v: string) => new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' })
  const hasNext = (y: { ends_on: string }) => years.some((x) => x.starts_on > y.ends_on)

  return (
    <>
      <PageHeader title="Financial years" description="Switch the year you are working in, start a new year, and close the old one" actions={<form action={createNextYear}><Button type="submit">Create next year</Button></form>} />
      {sp.ok && <p className="mb-4 rounded-lg bg-primary/10 px-3 py-2 text-sm">{sp.ok}</p>}
      {sp.error && <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{sp.error}</p>}
      <div className="grid max-w-3xl gap-3">
        {sorted.map((y) => (
          <section key={y.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div>
              <p className="flex items-center gap-2 font-medium">
                FY {y.label}
                {y.id === fy.id && <Badge>current</Badge>}
                {y.is_closed && <Badge variant="outline">closed</Badge>}
              </p>
              <p className="text-sm text-muted-foreground">{d(y.starts_on)} – {d(y.ends_on)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {y.id !== fy.id && (
                <form action={switchYear}><input type="hidden" name="fy" value={y.id} /><Button type="submit" variant="outline" size="sm">Work in this year</Button></form>
              )}
              {!y.is_closed && hasNext(y) && (
                <>
                  <form action={carryForward}><input type="hidden" name="fy" value={y.id} /><Button type="submit" variant="outline" size="sm">Carry balances forward</Button></form>
                  <form action={closeYear}><input type="hidden" name="fy" value={y.id} /><Button type="submit" variant="outline" size="sm">Close year</Button></form>
                </>
              )}
              {y.is_closed && (
                <form action={reopenYear}><input type="hidden" name="fy" value={y.id} /><Button type="submit" variant="ghost" size="sm">Reopen</Button></form>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-6 max-w-3xl rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">How year-end works</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Create next year in April so you can start billing in it; keep finishing entries in the old year.</li>
          <li>“Carry balances forward” copies closing balances of assets, liabilities and capital into the new year’s opening balances, and moves the year’s profit or loss into “Profit & Loss A/c”. Run it again whenever you change the old year.</li>
          <li>“Close year” carries forward one last time and locks the old year so nothing can be posted into it.</li>
        </ol>
      </div>
    </>
  )
}
