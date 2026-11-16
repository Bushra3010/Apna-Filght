import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function GstNav({ current, month }: { current: 'gstr1' | 'gstr2' | 'gstr3b'; month: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div className="flex gap-1.5">
        {(['gstr1', 'gstr2', 'gstr3b'] as const).map((r) => (
          <Link key={r} href={`/gst/${r}?month=${month}`} className={cn('rounded-lg border px-2.5 py-1 text-sm uppercase', current === r && 'border-primary bg-primary/10')}>
            {r.replace('gstr', 'GSTR-').replace('3b', '3B')}
          </Link>
        ))}
      </div>
      <form className="flex items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">Return period<Input type="month" name="month" defaultValue={month} /></label>
        <button className="h-8 rounded-lg border px-3 text-sm hover:bg-muted">Show</button>
      </form>
    </div>
  )
}
