'use client'

import { useState } from 'react'
import { formatINR } from '@/lib/money'

type Month = { label: string; sales: number; margin: number }

/** Single-series column chart (one hue, no legend). Hover / focus a bar for its values; a table view is below. */
export function MonthlySalesChart({ months }: { months: Month[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...months.map((m) => m.sales))
  const peak = months.reduce((p, m, i) => (m.sales > months[p].sales ? i : p), 0)
  const hasData = months.some((m) => m.sales !== 0)

  return (
    <figure className="grid gap-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Monthly sales</span>
        <span className="text-xs text-muted-foreground">net of credit notes</span>
      </figcaption>
      <div className="relative">
        <div className="flex h-44 items-end gap-0.5 border-b border-border" role="list" aria-label="Monthly sales">
          {months.map((m, i) => {
            const h = m.sales > 0 ? Math.max(2, (m.sales / max) * 100) : 0
            return (
              <button
                key={m.label}
                type="button"
                role="listitem"
                aria-label={`${m.label}: sales ${formatINR(m.sales)}, margin ${formatINR(m.margin)}`}
                className="group relative flex h-full flex-1 items-end justify-center px-[2px] outline-none"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <span
                  className="w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                  style={{ height: `${h}%` }}
                />
                {hasData && i === peak && m.sales > 0 && active === null && (
                  <span className="pointer-events-none absolute -top-1 -translate-y-full text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatINR(m.sales).replace(/\.00$/, '')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {active !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${((active + 0.5) / months.length) * 100}%`, transform: 'translateX(-50%)' }}
          >
            <p className="font-semibold tabular-nums">{formatINR(months[active].sales)}</p>
            <p className="text-muted-foreground">{months[active].label} · margin {formatINR(months[active].margin)}</p>
          </div>
        )}
        <div className="mt-1 flex gap-0.5 text-[10px] text-muted-foreground">
          {months.map((m) => (
            <span key={m.label} className="flex-1 text-center">{m.label.slice(0, 3)}</span>
          ))}
        </div>
      </div>
      {!hasData && <p className="text-xs text-muted-foreground">No sales posted yet this year.</p>}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Table view</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-muted-foreground"><th className="py-1">Month</th><th className="py-1 text-right">Sales</th><th className="py-1 text-right">Margin</th></tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.label} className="border-t"><td className="py-1">{m.label}</td><td className="py-1 text-right tabular-nums">{formatINR(m.sales)}</td><td className="py-1 text-right tabular-nums">{formatINR(m.margin)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

type Bucket = { bucket: string; amount: number; invoices: number }

/** Receivable ageing as a single-hue bar list; values are printed, so no tooltip is needed. */
export function AgeingBars({ buckets }: { buckets: Bucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.amount))
  return (
    <figure className="grid gap-3">
      <figcaption className="text-sm font-medium">Receivable ageing</figcaption>
      <ul className="grid gap-2">
        {buckets.map((b) => (
          <li key={b.bucket} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-xs">
            <span className="text-muted-foreground">{b.bucket}</span>
            <span className="h-2.5 rounded-r-[4px] bg-muted">
              <span className="block h-full rounded-r-[4px] bg-primary" style={{ width: `${(b.amount / max) * 100}%` }} />
            </span>
            <span className="min-w-24 text-right tabular-nums">
              {formatINR(b.amount)} <span className="text-muted-foreground">({b.invoices})</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
