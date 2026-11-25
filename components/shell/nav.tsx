'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  ArrowLeftRight, Banknote, BarChart3, BedDouble, BookOpen, CalendarDays, CalendarRange, Car, ClipboardList, Clock,
  Building2, Coins, Contact, FileMinus, FileSignature, FileSpreadsheet, FileText, Hotel, Landmark, LayoutGrid, Link2, List,
  Luggage, Map as MapIcon, NotebookPen, PieChart, Plane, Receipt, ReceiptIndianRupee, Route, Scale, ScrollText,
  Settings, ShoppingCart, Sparkles, Ticket, TrendingUp, Users, Wallet, Gauge, Shuffle, Bell, UsersRound, PlaneTakeoff,
  FileUp, Printer, MessageCircle, ChevronDown, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Item = { href: string; label: string; icon: LucideIcon }
type Section = { key: string; label: string; icon: LucideIcon; items: Item[]; bottom?: boolean }

export const SECTIONS: Section[] = [
  { key: 'home', label: 'Dashboard', icon: LayoutGrid, items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutGrid }] },
  {
    key: 'crm', label: 'CRM', icon: Contact,
    items: [
      { href: '/crm/dashboard', label: 'CRM dashboard', icon: Gauge },
      { href: '/crm/leads', label: 'Leads', icon: Contact },
      { href: '/crm/quotations', label: 'Quotations', icon: FileSignature },
      { href: '/crm/itineraries', label: 'Itineraries', icon: MapIcon },
      { href: '/crm/transfer', label: 'Lead transfer', icon: Shuffle },
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
      { href: '/billing/import', label: 'Import', icon: FileUp },
      { href: '/billing/print', label: 'Bulk print', icon: Printer },
    ],
  },
  {
    key: 'money', label: 'Payments', icon: Wallet,
    items: [
      { href: '/vouchers/receipts', label: 'Receipts', icon: Wallet },
      { href: '/vouchers/payments', label: 'Payments', icon: Banknote },
      { href: '/purchase/general', label: 'Purchase bills', icon: ShoppingCart },
      { href: '/purchase/groups', label: 'Group / FD', icon: PlaneTakeoff },
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
      { href: '/reports/alerts', label: 'Alerts', icon: Bell },
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
      { href: '/settings/team', label: 'Team', icon: UsersRound },
      { href: '/settings/messages', label: 'WhatsApp messages', icon: MessageCircle },
      { href: '/settings/companies', label: 'Companies', icon: Building2 },
      { href: '/settings/years', label: 'Financial years', icon: CalendarRange },
    ],
  },
]

// pages that live outside a section's tabs
const EXTRA: Record<string, string> = { '/reports/bills': 'reports', '/vouchers/batch': 'money' }

function activeSection(path: string) {
  const extra = Object.entries(EXTRA).find(([p]) => path.startsWith(p))
  if (extra) return SECTIONS.find((s) => s.key === extra[1])!
  return SECTIONS.find((s) => s.items.some((i) => path === i.href || path.startsWith(i.href + '/') || path.startsWith(i.href + '?'))) ?? SECTIONS[0]
}

const isOn = (path: string, href: string) => path === href || path.startsWith(href + '/')

/** Desktop sidebar: every area is a menu that opens to show its pages. */
export function Sidebar() {
  const path = usePathname()
  const current = activeSection(path)
  // Only what the user opened or closed by hand; the area of the current page is open by default.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  return (
    <nav aria-label="Main menu" className="-mx-2 flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
      {SECTIONS.map((s) => {
        const active = s.key === current.key
        const row = cn(
          'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          active && 'text-foreground',
        )
        if (s.items.length === 1) {
          return (
            <Link
              key={s.key}
              href={s.items[0].href}
              aria-current={active ? 'page' : undefined}
              className={cn(row, active && 'bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground')}
            >
              <s.icon className="size-[18px] shrink-0" />
              {s.label}
            </Link>
          )
        }
        const open = toggled[s.key] ?? active
        return (
          <div key={s.key}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setToggled((t) => ({ ...t, [s.key]: !open }))}
              className={row}
            >
              <s.icon className={cn('size-[18px] shrink-0', active && 'text-primary')} />
              <span className="flex-1 text-left">{s.label}</span>
              <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
              <ul className="mt-1 mb-2 ml-[21px] grid gap-0.5 border-l border-border pl-3">
                {s.items.map((i) => {
                  const on = isOn(path, i.href)
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={on ? 'page' : undefined}
                        className={cn(
                          'flex h-9 items-center rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                          on && 'bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                        )}
                      >
                        {i.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/** Phones only (the sidebar is hidden there): a row to switch area, then pill tabs for its pages. */
export function Tabs() {
  const path = usePathname()
  const current = activeSection(path)
  return (
    <div className="grid min-w-0 gap-2 md:hidden">
      <nav aria-label="Areas" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          const on = isOn(path, href)
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
