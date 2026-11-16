'use client'

import { useState } from 'react'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

type Month = { label: string; sales: number; margin: number }

const short = (paise: number) => {
  const r = paise / 100
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`
  if (Math.abs(r) >= 1e3) return `₹${(r / 1e3).toFixed(1)}k`
  return `₹${Math.round(r)}`
}

/**
 * Single-series column chart (one hue, no legend): thin rounded bars, month
 * pills, the current month in lime. Hover / focus a month for its values; a
 * table view sits below.
 */
export function MonthlySalesChart({ months, current }: { months: Month[]; current: number }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...months.map((m) => m.sales))
  const shown = active ?? current
  const hasData = months.some((m) => m.sales !== 0)

  return (
    <figure className="grid gap-4">
      <div className="relative">
        <div className="flex h-48 items-end gap-1.5" role="list" aria-label="Monthly sales">
          {months.map((m, i) => {
            const h = m.sales > 0 ? Math.max(3, (m.sales / max) * 100) : 0
            const on = i === shown
            return (
              <button
                key={m.label}
                type="button"
                role="listitem"
                aria-label={`${m.label}: sales ${formatINR(m.sales)}, margin ${formatINR(m.margin)}`}
                className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {on && m.sales > 0 && (
                  <span className="pointer-events-none absolute z-10 -translate-y-full rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-primary-foreground tabular-nums" style={{ bottom: `calc(${h}% + 6px)` }}>
                    {short(m.sales)}
                  </span>
                )}
                <span
                  className={cn(
                    'w-full max-w-3 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring',
                    on ? 'bg-primary' : 'bg-white/15 group-hover:bg-white/25',
                  )}
                  style={{ height: `${h}%` }}
                />
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex gap-1.5">
        {months.map((m, i) => (
          <span
            key={m.label}
            className={cn(
              'flex-1 rounded-full py-1 text-center text-[11px] font-medium text-muted-foreground',
              i === shown ? 'bg-primary/15 text-primary' : 'bg-muted/70',
            )}
          >
            {m.label.slice(0, 3)}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {months[shown] ? (
          <>
            <span className="font-semibold text-foreground">{months[shown].label}</span> · sales {formatINR(months[shown].sales)} · margin {formatINR(months[shown].margin)}
          </>
        ) : null}
        {!hasData && ' No sales posted yet this year.'}
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Table view</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Month</th><th className="py-1 text-right font-medium">Sales</th><th className="py-1 text-right font-medium">Margin</th></tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.label} className="border-t border-border"><td className="py-1">{m.label}</td><td className="py-1 text-right tabular-nums">{formatINR(m.sales)}</td><td className="py-1 text-right tabular-nums">{formatINR(m.margin)}</td></tr>
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
    <ul className="grid gap-3">
      {buckets.map((b) => (
        <li key={b.bucket} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 text-xs">
          <span className="text-muted-foreground">{b.bucket}</span>
          <span className="h-2 rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(b.amount / max) * 100}%` }} />
          </span>
          <span className="min-w-24 text-right font-semibold tabular-nums">
            {formatINR(b.amount)} <span className="font-normal text-muted-foreground">({b.invoices})</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
