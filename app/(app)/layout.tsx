import Link from 'next/link'
import { Bell, LogOut, Plane } from 'lucide-react'
import { getContext } from '@/lib/context'
import { loadAlerts } from '@/lib/alerts'
import { signOut } from '../(auth)/actions'
import { Sidebar, Tabs } from '@/components/shell/nav'
import { Button } from '@/components/ui/button'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  const alertCount = (await loadAlerts()).length
  const initials = (ctx.member.name || ctx.user.email).replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')

  return (
    <div className="flex min-h-svh gap-6 px-4 py-4 md:px-6 md:py-6 print:block print:p-0">
      <aside className="sticky top-6 hidden h-[calc(100svh-3rem)] w-60 shrink-0 flex-col gap-4 rounded-3xl bg-card p-4 md:flex print:hidden">
        <Link href="/dashboard" className="flex items-center gap-3 px-1">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Plane className="size-5" />
          </span>
          <span className="text-base font-bold tracking-tight">Apna Flight</span>
        </Link>
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mb-8 flex flex-wrap items-start gap-3 print:hidden">
          <Link href="/dashboard" aria-label="Apna Flight home" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground md:hidden">
            <Plane className="size-5" />
          </Link>
          <div className="order-last min-w-0 basis-full md:hidden">
            <Tabs />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link href="/settings/companies" title="Switch company" className="hidden h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium hover:bg-accent lg:flex">{ctx.org.name}</Link>
            <Link
              href="/settings/years"
              className="flex h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
              title="Financial year"
            >
              FY {ctx.fy.label}{ctx.fy.is_closed && ' · closed'}
            </Link>
            <Link
              href="/reports/alerts"
              aria-label={`Alerts: ${alertCount}`}
              title="Alerts"
              className="relative flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
            >
              <Bell className="size-[18px]" />
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-tile-red px-1 text-[10px] font-bold text-white">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
            </Link>
            <span
              title={ctx.user.email}
              className="flex size-11 items-center justify-center rounded-full bg-tile-purple text-sm font-bold text-white"
            >
              {initials || 'AF'}
            </span>
            <form action={signOut}>
              <Button variant="outline" size="icon" type="submit" aria-label="Sign out" title="Sign out">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <main className="w-full flex-1 print:max-w-none">{children}</main>
      </div>
    </div>
  )
}
