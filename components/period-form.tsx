import { Input } from '@/components/ui/input'

/** GET form for a date range or an as-on date; keeps other params as hidden fields. */
export function PeriodForm({
  from,
  to,
  min,
  max,
  asOn,
  extra,
  children,
}: {
  from?: string
  to: string
  min: string
  max: string
  asOn?: boolean
  extra?: Record<string, string | undefined>
  children?: React.ReactNode
}) {
  return (
    <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
      {Object.entries(extra ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {!asOn && (
        <label className="grid gap-1 text-xs text-muted-foreground">From<Input type="date" name="from" defaultValue={from} min={min} max={max} /></label>
      )}
      <label className="grid gap-1 text-xs text-muted-foreground">{asOn ? 'As on' : 'To'}<Input type="date" name="to" defaultValue={to} min={min} max={max} /></label>
      {children}
      <button className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">Show</button>
    </form>
  )
}
