// GST and totals for one invoice line. Every amount is integer paise.
//
// Travel agents charge GST on their own service (fee + other charges − discount).
// Base fare and airline taxes (XT) are collected on the airline's behalf and are
// not taxed again here. Intra-state supply → CGST + SGST; inter-state → IGST.

export type LineAmounts = {
  basic: number
  xt: number
  service_fee: number
  other_charges: number
  discount: number
  gst_rate: number // percent, e.g. 18
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

export function computeLine(a: LineAmounts, interstate: boolean): LineTotals {
  const taxable = Math.max(0, a.service_fee + a.other_charges - a.discount)
  const tax = Math.round((taxable * a.gst_rate) / 100)
  const igst = interstate ? tax : 0
  const cgst = interstate ? 0 : Math.round(tax / 2)
  const sgst = interstate ? 0 : tax - cgst
  const net_sale = a.basic + a.xt + a.service_fee + a.other_charges - a.discount + cgst + sgst + igst
  const net_purchase = a.purchase_gross - a.commission + a.tds
  const margin = net_sale - cgst - sgst - igst - (a.purchase_gross - a.purchase_gst - a.commission)
  return { taxable, cgst, sgst, igst, net_sale, net_purchase, margin }
}

export const GST_RATES = [0, 5, 12, 18, 28] as const
