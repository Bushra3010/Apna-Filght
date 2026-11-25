'use client'

import { CalendarDays } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** A date box with a clear calendar icon; clicking anywhere on it opens the calendar. Typing the date still works. */
export function DateInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <div className={cn('date-field relative', className)}>
      <Input
        type="date"
        className="cursor-pointer pr-10"
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.()
          } catch {
            // already open, or the browser does not allow it: the box still accepts typing
          }
        }}
        {...props}
      />
      <CalendarDays className="pointer-events-none absolute top-1/2 right-3 size-[18px] -translate-y-1/2 text-primary" />
    </div>
  )
}
