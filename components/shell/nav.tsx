'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight, BookOpen, Banknote, CalendarDays, Contact, FileMinus, FileText, LayoutDashboard, List,
  NotebookPen, Plane, Receipt, Settings, ShoppingCart, Users, Wallet, Landmark, Map as MapIcon, Hotel, Car, Route,
  ScrollText, FileSignature, Ticket, BedDouble, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export const NAV = [
  { group: '', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    group: 'CRM',
    items: [
      { href: '/crm/leads', label: 'Leads', icon: Contact },
      { href: '/crm/quotations', label: 'Quotations', icon: FileSignature },
      { href: '/crm/itineraries', label: 'Itineraries', icon: MapIcon },
    ],
  },
  {
    group: 'Packages',
    items: [
      { href: '/crm/hotels', label: 'Hotels & rates', icon: Hotel },
      { href: '/crm/activities', label: 'Activities', icon: Sparkles },
      { href: '/crm/vehicles', label: 'Vehicles', icon: Car },
      { href: '/crm/routes', label: 'Routes', icon: Route },
      { href: '/crm/policies', label: 'Policies', icon: ScrollText },
    ],
  },
  {
    group: 'Billing',
    items: [
      { href: '/billing/invoices', label: 'Invoices', icon: FileText },
      { href: '/billing/proformas', label: 'Proformas', icon: Ticket },
      { href: '/billing/credit-notes', label: 'Credit notes', icon: FileMinus },
      { href: '/billing/hotel-vouchers', label: 'Hotel vouchers', icon: BedDouble },
    ],
  },
  { group: 'Purchase', items: [{ href: '/purchase/general', label: 'Purchase bills', icon: ShoppingCart }] },
  {
    group: 'Vouchers',
    items: [
      { href: '/vouchers/receipts', label: 'Receipts', icon: Wallet },
      { href: '/vouchers/payments', label: 'Payments', icon: Banknote },
      { href: '/vouchers/contra', label: 'Contra', icon: ArrowLeftRight },
      { href: '/vouchers/journal', label: 'Journal', icon: NotebookPen },
    ],
  },
  {
    group: 'Accounts',
    items: [
      { href: '/accounts/ledger', label: 'Ledger statement', icon: BookOpen },
      { href: '/accounts/cash-book', label: 'Cash book', icon: Receipt },
      { href: '/accounts/bank-book', label: 'Bank book', icon: Landmark },
      { href: '/accounts/day-book', label: 'Day book', icon: CalendarDays },
    ],
  },
  {
    group: 'Masters',
    items: [
      { href: '/masters/ledgers', label: 'Ledgers', icon: Users },
      { href: '/masters/passengers', label: 'Passengers', icon: Plane },
      { href: '/masters/lists', label: 'Lists', icon: List },
    ],
  },
  { group: 'Settings', items: [{ href: '/settings/company', label: 'Company', icon: Settings }] },
]

export function SideNav() {
  const path = usePathname()
  return (
    <nav className="grid gap-3 overflow-y-auto text-sm">
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
