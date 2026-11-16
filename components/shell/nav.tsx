'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, FileText, LayoutDashboard, Settings, Users, Wallet, Contact } from 'lucide-react'
import { cn } from '@/lib/utils'

export const NAV = [
  { group: '', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { group: 'CRM', items: [{ href: '/crm/leads', label: 'Leads', icon: Contact }] },
  { group: 'Billing', items: [{ href: '/billing/invoices', label: 'Invoices', icon: FileText }] },
  { group: 'Vouchers', items: [{ href: '/vouchers/receipts', label: 'Receipts', icon: Wallet }] },
  { group: 'Accounts', items: [{ href: '/accounts/ledger', label: 'Ledger statement', icon: BookOpen }] },
  { group: 'Masters', items: [{ href: '/masters/ledgers', label: 'Ledgers', icon: Users }] },
  { group: 'Settings', items: [{ href: '/settings/company', label: 'Company', icon: Settings }] },
]

export function SideNav() {
  const path = usePathname()
  return (
    <nav className="grid gap-4 text-sm">
      {NAV.map((g) => (
        <div key={g.group || 'root'} className="grid gap-0.5">
          {g.group && <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.group}</p>}
          {g.items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted',
                path.startsWith(href) && 'bg-muted font-medium text-foreground',
              )}
            >
              <Icon className="size-4 text-muted-foreground" />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function MobileNav() {
  const path = usePathname()
  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-2 text-sm md:hidden">
      {NAV.flatMap((g) => g.items).map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn('shrink-0 rounded-lg px-2.5 py-1 hover:bg-muted', path.startsWith(href) && 'bg-muted font-medium')}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
