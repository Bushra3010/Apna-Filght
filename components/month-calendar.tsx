import { cn } from '@/lib/utils'

export type CalEvent = {
  date: string
  kind: 'followup' | 'travel' | 'trip'
  label: string
  /** the staff member responsible: lead owner for follow-ups and enquiries, whoever billed a trip */
  who?: { name: string; initials: string }
}

// which colour a day takes when it has several kinds of event (the first that applies)
const ORDER: CalEvent['kind'][] = ['followup', 'travel', 'trip']
const BORDER: Record<CalEvent['kind'], string> = {
  followup: 'border-tile-orange',
  travel: 'border-tile-cyan',
  trip: 'border-tile-purple',
}
const NAME: Record<CalEvent['kind'], string> = { followup: 'Follow-up', travel: 'Enquiry travel date', trip: 'Booked trip' }

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** First and last date shown: whole weeks, Monday to Sunday, around the month. */
export function calendarRange(year: number, month: number): [string, string] {
  const first = new Date(Date.UTC(year, month, 1))
  const last = new Date(Date.UTC(year, month + 1, 0))
  const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * 86400000)
  const end = new Date(last.getTime() + ((7 - last.getUTCDay()) % 7) * 86400000)
  return [iso(start), iso(end)]
}

/** "Asha Rao" → "AR", "dmehta@x.com" → "DM" */
export function initials(name: string): string {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  const two = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)
  return two.toUpperCase()
}

const SAMPLE_PEOPLE = ['Asha Rao', 'Omar Shaikh', 'Priya Mehta', 'Dev Malhotra']
const SAMPLE: [number, CalEvent['kind'], number, string][] = [
  // [day offset from the 1st, kind, person, label]
  [2, 'followup', 0, 'Follow-up: Mr Sharma — Goa package quote'],
  [10, 'travel', 1, 'Enquiry travels: Khan family, Dubai 4N'],
  [16, 'followup', 3, 'Follow-up: Kapoor wedding group, 40 pax'],
  [21, 'followup', 1, 'Follow-up: corporate offsite, Jaipur'],
  [21, 'trip', 2, 'Trip: Verma family, DEL-SXR'],
  [25, 'trip', 2, 'Trip: Iyer couple, Maldives honeymoon'],
  [28, 'travel', 0, 'Enquiry travels: school trip, Shimla'],
  [34, 'trip', 0, 'Trip: Nair family, Singapore 5N'],
]

/** Made-up events so an empty calendar still shows how it works (marked as samples on screen). */
export function sampleEvents(year: number, month: number): CalEvent[] {
  return SAMPLE.map(([off, kind, p, label]) => {
    const name = SAMPLE_PEOPLE[p]
    return { date: iso(new Date(Date.UTC(year, month, 1 + off))), kind, label: `Sample — ${label}`, who: { name, initials: initials(name) } }
  })
}

/**
 * Month grid. A bordered day has something due: the border colour says what (follow-up, enquiry
 * travel, booked trip) and the badge says who is responsible. Today has a lime border.
 */
export function MonthCalendar({ year, month, today, events, sample }: { year: number; month: number; today: string; events: CalEvent[]; sample?: boolean }) {
  const [from, to] = calendarRange(year, month)
  const byDay = new Map<string, CalEvent[]>()
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const days: string[] = []
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) days.push(iso(new Date(t)))
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`

  return (
    <div>
      <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted-foreground">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <ol className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const ev = byDay.get(day) ?? []
          const inMonth = day.slice(0, 7) === ym
          const kind = ORDER.find((k) => ev.some((e) => e.kind === k))
          const people = [...new Map(ev.filter((e) => e.who).map((e) => [e.who!.initials, e.who!])).values()]
          const isToday = day === today
          const title = ev.length ? ev.map((e) => `${e.label}${e.who ? ` — ${e.who.name}` : ''}`).join('\n') : undefined
          return (
            <li
              key={day}
              title={title}
              aria-label={`${Number(day.slice(8))}${isToday ? ', today' : ''}${ev.length ? `: ${ev.length} item${ev.length > 1 ? 's' : ''}${people.length ? `, ${people.map((p) => p.name).join(', ')}` : ''}` : ''}`}
              className={cn(
                'relative aspect-square overflow-hidden rounded-xl border-2 border-transparent text-sm font-semibold tabular-nums',
                inMonth ? 'bg-muted/70' : 'bg-muted/25 text-muted-foreground/50',
                kind && BORDER[kind],
                kind && !inMonth && 'opacity-60',
                isToday && 'border-primary',
              )}
            >
              <span className="absolute top-1.5 left-2 leading-none">{Number(day.slice(8))}</span>
              {people.length > 0 && (
                <span className="absolute right-1 bottom-1 flex size-[22px] items-center justify-center rounded-full bg-foreground/15 text-[8.5px] font-bold tracking-tight text-foreground">
                  {people[0].initials}
                  {people.length > 1 && (
                    <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground">{people.length}</span>
                  )}
                </span>
              )}
              {kind && people.length === 0 && ev.length > 1 && <span className="absolute right-2 bottom-1.5 text-[9px] text-muted-foreground">{ev.length}</span>}
            </li>
          )
        })}
      </ol>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-3">
          {ORDER.map((k) => (
            <span key={k} className={cn('flex items-center gap-1.5')}>
              <span className={cn('size-3 rounded border-2', BORDER[k])} />{NAME[k]}
            </span>
          ))}
        </div>
        <p>Bordered days have something due, coloured by type; the badge shows who is responsible. Hover a day for details.</p>
        {sample && (
          <p className="rounded-xl bg-tile-orange/15 px-3 py-2 text-foreground">
            Showing sample events: this company has no follow-ups, enquiry travel dates or trips yet. They disappear as soon as real ones are added.
          </p>
        )}
      </div>
    </div>
  )
}
