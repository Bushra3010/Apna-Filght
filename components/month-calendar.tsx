import { cn } from '@/lib/utils'

export type CalEvent = { date: string; kind: 'followup' | 'travel' | 'trip'; label: string }

const RING: Record<CalEvent['kind'], string> = {
  followup: 'ring-tile-orange',
  travel: 'ring-tile-cyan',
  trip: 'ring-tile-purple',
}
const DOT: Record<CalEvent['kind'], string> = {
  followup: 'bg-tile-orange',
  travel: 'bg-tile-cyan',
  trip: 'bg-tile-purple',
}

/** Month grid; days with events get a coloured ring and a count, today is lime. */
export function MonthCalendar({ year, month, today, events }: { year: number; month: number; today: string; events: CalEvent[] }) {
  const first = new Date(Date.UTC(year, month, 1))
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7 // Monday first
  const byDay = new Map<number, CalEvent[]>()
  for (const e of events) {
    const d = Number(e.date.slice(8, 10))
    if (e.date.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`) byDay.set(d, [...(byDay.get(d) ?? []), e])
  }
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (d === null) return <li key={`x${i}`} aria-hidden />
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const ev = byDay.get(d) ?? []
          const kind = ev[0]?.kind
          const isToday = iso === today
          return (
            <li
              key={iso}
              title={ev.length ? ev.map((e) => e.label).join('\n') : undefined}
              aria-label={`${d}${ev.length ? `: ${ev.length} event${ev.length > 1 ? 's' : ''}` : ''}`}
              className={cn(
                'relative flex aspect-square flex-col items-start justify-between rounded-2xl bg-muted/70 p-1.5 text-xs font-semibold',
                ev.length > 0 && `ring-2 ring-inset ${RING[kind!]}`,
                isToday && 'bg-primary text-primary-foreground',
              )}
            >
              <span>{d}</span>
              {ev.length > 0 && (
                <span className="flex items-center gap-0.5 self-end">
                  {[...new Set(ev.map((e) => e.kind))].map((k) => <span key={k} className={cn('size-1.5 rounded-full', DOT[k])} />)}
                  {ev.length > 1 && <span className="ml-0.5 text-[10px] leading-none">{ev.length}</span>}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-tile-orange" />Follow-up</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-tile-cyan" />Lead travel</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-tile-purple" />Booked trip</span>
      </div>
    </div>
  )
}
