'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight, Banknote, BarChart3, BedDouble, BookOpen, CalendarDays, CalendarRange, Car, ClipboardList, Clock,
  Building2, Coins, Contact, FileMinus, FileSignature, FileSpreadsheet, FileText, Hotel, Landmark, LayoutGrid, Link2, List,
  Luggage, Map as MapIcon, NotebookPen, PieChart, Plane, Receipt, ReceiptIndianRupee, Route, Scale, ScrollText,
  Settings, ShoppingCart, Sparkles, Ticket, TrendingUp, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Item = { href: string; label: string; icon: LucideIcon }
type Section = { key: string; label: string; icon: LucideIcon; items: Item[]; bottom?: boolean }

export const SECTIONS: Section[] = [
  { key: 'home', label: 'Dashboard', icon: LayoutGrid, items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutGrid }] },
  {
    key: 'crm', label: 'CRM', icon: Contact,
    items: [
      { href: '/crm/leads', label: 'Leads', icon: Contact },
      { href: '/crm/quotations', label: 'Quotations', icon: FileSignature },
      { href: '/crm/itineraries', label: 'Itineraries', icon: MapIcon },
    ],
  },
  {
    key: 'packages', label: 'Packages', icon: Luggage,
    items: [
      { href: '/crm/hotels', label: 'Hotels & rates', icon: Hotel },
      { href: '/crm/activities', label: 'Activities', icon: Sparkles },
      { href: '/crm/vehicles', label: 'Vehicles', icon: Car },
      { href: '/crm/routes', label: 'Routes', icon: Route },
      { href: '/crm/policies', label: 'Policies', icon: ScrollText },
    ],
  },
  {
    key: 'billing', label: 'Billing', icon: FileText,
    items: [
      { href: '/billing/invoices', label: 'Invoices', icon: FileText },
      { href: '/billing/proformas', label: 'Proformas', icon: Ticket },
      { href: '/billing/credit-notes', label: 'Credit notes', icon: FileMinus },
      { href: '/billing/hotel-vouchers', label: 'Hotel vouchers', icon: BedDouble },
    ],
  },
  {
    key: 'money', label: 'Payments', icon: Wallet,
    items: [
      { href: '/vouchers/receipts', label: 'Receipts', icon: Wallet },
      { href: '/vouchers/payments', label: 'Payments', icon: Banknote },
      { href: '/purchase/general', label: 'Purchase bills', icon: ShoppingCart },
      { href: '/vouchers/contra', label: 'Contra', icon: ArrowLeftRight },
      { href: '/vouchers/journal', label: 'Journal', icon: NotebookPen },
      { href: '/vouchers/adjust', label: 'Bill adjustment', icon: Link2 },
    ],
  },
  {
    key: 'accounts', label: 'Accounts', icon: BookOpen,
    items: [
      { href: '/accounts/ledger', label: 'Ledger', icon: BookOpen },
      { href: '/accounts/cash-book', label: 'Cash book', icon: Receipt },
      { href: '/accounts/bank-book', label: 'Bank book', icon: Landmark },
      { href: '/accounts/day-book', label: 'Day book', icon: CalendarDays },
      { href: '/accounts/trial-balance', label: 'Trial balance', icon: Scale },
      { href: '/accounts/profit-loss', label: 'Profit & loss', icon: TrendingUp },
      { href: '/accounts/balance-sheet', label: 'Balance sheet', icon: PieChart },
      { href: '/accounts/opening-balances', label: 'Opening balances', icon: Coins },
    ],
  },
  {
    key: 'reports', label: 'Reports', icon: BarChart3,
    items: [
      { href: '/reports/outstanding', label: 'Outstanding', icon: Clock },
      { href: '/reports/sales-register', label: 'Sales register', icon: ClipboardList },
      { href: '/reports/purchase-register', label: 'Purchase register', icon: FileSpreadsheet },
      { href: '/gst/gstr1', label: 'GSTR-1', icon: ReceiptIndianRupee },
      { href: '/gst/gstr2', label: 'GSTR-2', icon: ReceiptIndianRupee },
      { href: '/gst/gstr3b', label: 'GSTR-3B', icon: ReceiptIndianRupee },
    ],
  },
  {
    key: 'masters', label: 'Masters', icon: Users,
    items: [
      { href: '/masters/ledgers', label: 'Ledgers', icon: Users },
      { href: '/masters/passengers', label: 'Passengers', icon: Plane },
      { href: '/masters/lists', label: 'Lists', icon: List },
    ],
  },
  {
    key: 'settings', label: 'Settings', icon: Settings, bottom: true,
    items: [
      { href: '/settings/company', label: 'Company', icon: Settings },
      { href: '/settings/companies', label: 'Companies', icon: Building2 },
      { href: '/settings/years', label: 'Financial years', icon: CalendarRange },
    ],
  },
]

// pages that live outside a section's tabs
const EXTRA: Record<string, string> = { '/reports/bills': 'reports' }

function activeSection(path: string) {
  const extra = Object.entries(EXTRA).find(([p]) => path.startsWith(p))
  if (extra) return SECTIONS.find((s) => s.key === extra[1])!
  return SECTIONS.find((s) => s.items.some((i) => path === i.href || path.startsWith(i.href + '/') || path.startsWith(i.href + '?'))) ?? SECTIONS[0]
}

/** Slim icon rail (desktop). */
export function Rail() {
  const path = usePathname()
  const current = activeSection(path)
  const link = (s: Section) => (
    <Link
      key={s.key}
      href={s.items[0].href}
      title={s.label}
      aria-label={s.label}
      aria-current={s.key === current.key ? 'page' : undefined}
      className={cn(
        'flex size-11 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        s.key === current.key && 'bg-secondary text-primary ring-1 ring-primary/50 hover:bg-secondary hover:text-primary',
      )}
    >
      <s.icon className="size-[18px]" />
    </Link>
  )
  return (
    <nav aria-label="Areas" className="flex flex-1 flex-col items-center gap-3">
      {SECTIONS.filter((s) => !s.bottom).map(link)}
      <div className="mt-auto flex flex-col items-center gap-3">{SECTIONS.filter((s) => s.bottom).map(link)}</div>
    </nav>
  )
}

/** Pill tabs for the current area; on phones also a row to switch area. */
export function Tabs() {
  const path = usePathname()
  const current = activeSection(path)
  return (
    <div className="grid min-w-0 gap-2">
      <nav aria-label="Areas" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={s.items[0].href}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-medium text-muted-foreground',
              s.key === current.key && 'bg-secondary text-foreground',
            )}
          >
            <s.icon className="size-3.5" />
            {s.label}
          </Link>
        ))}
      </nav>
      <nav aria-label={current.label} className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {current.items.map(({ href, label, icon: Icon }) => {
          const on = path === href || path.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                on && 'border-transparent bg-primary font-semibold text-primary-foreground hover:text-primary-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
