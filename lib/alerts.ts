import 'server-only'
import { cache } from 'react'
import { getContext } from '@/lib/context'

export type Alert = { kind: string; doc_id: string; doc_no: string; doc_date: string; party: string; detail: string; amount: number | null }

export const ALERT_KINDS: { key: string; title: string; hint: string; tone: 'bad' | 'warn' }[] = [
  { key: 'invalid_gst', title: 'GSTIN and place of supply differ', hint: 'Check the client’s GSTIN or the invoice’s place of supply before filing GSTR-1', tone: 'bad' },
  { key: 'loss', title: 'Sold below cost', hint: 'Invoices with a negative margin', tone: 'bad' },
  { key: 'loss_cn', title: 'Refund above recovery', hint: 'Credit notes where you refunded more than the supplier returned', tone: 'warn' },
  { key: 'pending_purchase', title: 'Sales without a purchase', hint: 'Lines with no supplier cost: margin and payables are incomplete', tone: 'warn' },
  { key: 'date_mismatch', title: 'Purchase in a different month', hint: 'Supplier invoice month differs from the sale month (affects GST matching)', tone: 'warn' },
  { key: 'stale_proforma', title: 'Proformas not invoiced', hint: 'Open for more than 7 days', tone: 'warn' },
  { key: 'overdue_followup', title: 'Overdue follow-ups', hint: 'Open leads with a missed follow-up', tone: 'warn' },
]

export const loadAlerts = cache(async () => {
  const { supabase, org, fy } = await getContext()
  const { data, error } = await supabase.rpc('alerts', { p_org: org.id, p_fy: fy.id })
  if (error) return [] as Alert[]
  return (data ?? []) as Alert[]
})
