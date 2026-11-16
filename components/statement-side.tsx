import Link from 'next/link'
import { formatAmount } from '@/lib/money'
import type { Section } from '@/lib/statements'

/** One side of a two-column statement (P&L or balance sheet). */
export function StatementSide({
  title,
  sections,
  extra,
  total,
  from,
  to,
}: {
  title: string
  sections: Section[]
  extra?: { label: string; amount: number; tone?: 'good' | 'bad' }[]
  total: number
  from: string
  to: string
}) {
  return (
    <section className="flex flex-col rounded-3xl bg-card">
      <h2 className="border-b px-4 py-2 text-sm font-semibold">{title}</h2>
      <div className="flex-1 divide-y">
        {sections.map((s) => (
          <details key={s.key} className="group px-4 py-2 text-sm" open>
            <summary className="flex cursor-pointer justify-between gap-4 font-medium marker:content-none">
              <span>{s.name}</span>
              <span className="tabular-nums">{formatAmount(s.total)}</span>
            </summary>
            <ul className="mt-1 grid gap-0.5 text-muted-foreground">
              {s.ledgers.map((l) => (
                <li key={l.id} className="flex justify-between gap-4 pl-4">
                  <Link href={`/accounts/ledger?ledger=${l.id}&from=${from}&to=${to}`} className="hover:text-foreground hover:underline">{l.name}</Link>
                  <span className="tabular-nums">{formatAmount(l.amount)}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {extra?.map((e) => (
          <div key={e.label} className="flex justify-between gap-4 px-4 py-2 text-sm font-medium">
            <span className={e.tone === 'bad' ? 'text-destructive' : undefined}>{e.label}</span>
            <span className="tabular-nums">{formatAmount(e.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between gap-4 border-t px-4 py-2 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatAmount(total)}</span>
      </div>
    </section>
  )
}
