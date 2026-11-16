import { LogOut, Plane } from 'lucide-react'
import { getContext } from '@/lib/context'
import { signOut } from '../(auth)/actions'
import { MobileNav, SideNav } from '@/components/shell/nav'
import { Button } from '@/components/ui/button'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext()
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh print:hidden w-56 shrink-0 flex-col border-r bg-muted/30 p-3 md:flex">
        <div className="mb-5 flex items-center gap-2 px-2 pt-1 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="size-3.5" />
          </span>
          Apna Flight
        </div>
        <SideNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b print:hidden bg-background/95 backdrop-blur">
          <div className="flex h-12 items-center justify-between gap-3 px-4">
            <div className="min-w-0 truncate text-sm">
              <span className="font-medium">{ctx.org.name}</span>
              <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">FY {ctx.fy.label}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">{ctx.user.email}</span>
              <form action={signOut}>
                <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out">
                  <LogOut />
                </Button>
              </form>
            </div>
          </div>
          <MobileNav />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  )
}
