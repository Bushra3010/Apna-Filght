import { Input } from '@/components/ui/input'

/** Return-period picker for the GST pages (the GSTR tabs live in the top bar). */
export function GstNav({ month }: { current?: 'gstr1' | 'gstr2' | 'gstr3b'; month: string }) {
  return (
    <form className="mb-6 flex flex-wrap items-end gap-2 print:hidden">
      <label className="grid gap-1 text-xs text-muted-foreground">Return period<Input type="month" name="month" defaultValue={month} className="w-44" /></label>
      <button className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">Show</button>
    </form>
  )
}
