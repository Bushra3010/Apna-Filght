// Quotation draft shared by the builder (client) and save action (server).
// Money fields are rupee strings as typed; qty is a decimal string.

export type QuoteItemKind = 'hotel' | 'activity' | 'vehicle' | 'flight' | 'visa' | 'insurance' | 'other'

export type QuoteItem = {
  kind: QuoteItemKind
  day_no: string
  description: string
  hotel_rate_id: string
  activity_rate_id: string
  vehicle_id: string
  qty: string
  unit_cost: string
  unit_price: string
}

export type QuoteDraft = {
  id?: string
  quote_date: string
  lead_id: string
  party_ledger_id: string
  client_name: string
  itinerary_id: string
  route_id: string
  package_title_id: string
  meal_plan_id: string
  start_date: string
  nights: string
  adults: string
  children: string
  infants: string
  gst_rate: string
  valid_until: string
  inclusions: string
  exclusions: string
  terms: string
  items: QuoteItem[]
}

export const QUOTE_STATUSES = [
  ['draft', 'Draft'],
  ['sent', 'Sent'],
  ['accepted', 'Accepted'],
  ['rejected', 'Rejected'],
] as const

export const blankItem = (kind: QuoteItemKind = 'other'): QuoteItem => ({
  kind, day_no: '', description: '', hotel_rate_id: '', activity_rate_id: '', vehicle_id: '', qty: '1', unit_cost: '', unit_price: '',
})

/** Rupee-string arithmetic for the preview; the database recomputes on save. */
export function quoteTotals(items: QuoteItem[], gstRate: number, toPaise: (v: string) => number) {
  let cost = 0
  let sub = 0
  for (const it of items) {
    const q = Number(it.qty) || 0
    cost += Math.round(q * toPaise(it.unit_cost))
    sub += Math.round(q * toPaise(it.unit_price))
  }
  const tax = Math.round((sub * gstRate) / 100)
  return { cost, sub, margin: sub - cost, tax, total: sub + tax }
}
