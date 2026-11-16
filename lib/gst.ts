// GST and totals for one invoice line. Every amount is integer paise.
//
// gst_on = 'service': GST on the agent's own charges (fee + other − discount).
//   Used for air / rail / bus tickets and visas, where the fare and XT are
//   collected on the carrier's or embassy's behalf.
// gst_on = 'full': GST on the whole value (basic + fee + other − discount),
//   e.g. hotel or tour sold as principal, taxi, misc services.
// XT (carrier taxes) is never taxed again. Intra-state → CGST + SGST; inter-state → IGST.

export type GstOn = 'service' | 'full'

export type LineAmounts = {
  basic: number
  xt: number
  service_fee: number
  other_charges: number
  discount: number
  gst_rate: number // percent, e.g. 18
  gst_on?: GstOn
  purchase_gross: number
  purchase_gst: number
  commission: number
  tds: number
}

export type LineTotals = {
  taxable: number
  cgst: number
  sgst: number
  igst: number
  net_sale: number
  net_purchase: number
  margin: number
}

export function computeTax(taxable: number, rate: number, interstate: boolean) {
  const tax = Math.round((taxable * rate) / 100)
  const igst = interstate ? tax : 0
  const cgst = interstate ? 0 : Math.round(tax / 2)
  const sgst = interstate ? 0 : tax - cgst
  return { cgst, sgst, igst }
}

export function computeLine(a: LineAmounts, interstate: boolean): LineTotals {
  const base = a.gst_on === 'full' ? a.basic : 0
  const taxable = Math.max(0, base + a.service_fee + a.other_charges - a.discount)
  const { cgst, sgst, igst } = computeTax(taxable, a.gst_rate, interstate)
  const net_sale = a.basic + a.xt + a.service_fee + a.other_charges - a.discount + cgst + sgst + igst
  const net_purchase = a.purchase_gross - a.commission + a.tds
  const margin = net_sale - cgst - sgst - igst - (a.purchase_gross - a.purchase_gst - a.commission)
  return { taxable, cgst, sgst, igst, net_sale, net_purchase, margin }
}

export const GST_RATES = [0, 5, 12, 18, 28] as const
