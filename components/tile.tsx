import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const TONES = {
  blue: 'bg-tile-blue',
  orange: 'bg-tile-orange',
  purple: 'bg-tile-purple',
  green: 'bg-tile-green',
  red: 'bg-tile-red',
  cyan: 'bg-tile-cyan',
} as const

/** Colour stat card: #tag, title, sub-line, big figure, round arrow link. */
export function Tile({
  tone,
  tag,
  title,
  sub,
  value,
  href,
}: {
  tone: keyof typeof TONES
  tag: string
  title: string
  sub: string
  value: string
  href: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex min-h-40 flex-col justify-between rounded-3xl p-5 text-white transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none',
        TONES[tone],
      )}
    >
      <div className="pr-10">
        <p className="text-xs font-medium text-white/75">#{tag}</p>
        <p className="mt-0.5 text-xl font-bold tracking-tight">{title}</p>
        <p className="mt-1 text-sm text-white/80">{sub}</p>
      </div>
      <p className="mt-4 text-[1.9rem] leading-none font-bold tracking-tight tabular-nums">{value}</p>
      <span className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/20 transition-colors group-hover:bg-white/30">
        <ArrowUpRight className="size-4" />
      </span>
    </Link>
  )
}

/** Small chip like "+14% week": lime on a dark lime wash. */
export function DeltaChip({ children, down }: { children: React.ReactNode; down?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold',
        down ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary',
      )}
    >
      {children}
    </span>
  )
}

/** Card frame with a title, an optional {count}, and round icon actions on the right. */
export function Panel({
  title,
  count,
  href,
  children,
  className,
}: {
  title: string
  count?: string | number
  href?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-3xl bg-card p-5 md:p-6', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight md:text-2xl">
          {title}
          {count !== undefined && <span className="ml-1 align-top text-sm font-medium text-muted-foreground">{`{${count}}`}</span>}
        </h2>
        {href && (
          <Link href={href} aria-label={`Open ${title}`} className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}
