// Shapes shared by the invoice form (client) and the save action (server).
// Amounts in the draft are rupee strings as typed; the server converts to paise.

export const BILL_TYPES = [
  ['domestic', 'Domestic flight'],
  ['international', 'International flight'],
] as const

export type LineDraft = {
  pax_name: string
  pax_type: 'adult' | 'child' | 'infant'
  airline_id: string
  flight_no: string
  sector: string
  travel_date: string
  return_date: string
  pnr: string
  ticket_no: string
  basic: string
  xt: string
  service_fee: string
  other_charges: string
  discount: string
  gst_rate: string
  supplier_ledger_id: string
  supplier_invoice_no: string
  purchase_gross: string
  purchase_gst: string
  commission: string
  tds: string
}

export type InvoiceDraft = {
  id?: string
  bill_type: string
  invoice_date: string
  due_date: string
  party_ledger_id: string
  place_of_supply_state_id: string
  contact_phone: string
  lead_id: string
  notes: string
  lines: LineDraft[]
}

export const emptyLine = (): LineDraft => ({
  pax_name: '',
  pax_type: 'adult',
  airline_id: '',
  flight_no: '',
  sector: '',
  travel_date: '',
  return_date: '',
  pnr: '',
  ticket_no: '',
  basic: '',
  xt: '',
  service_fee: '',
  other_charges: '',
  discount: '',
  gst_rate: '18',
  supplier_ledger_id: '',
  supplier_invoice_no: '',
  purchase_gross: '',
  purchase_gst: '',
  commission: '',
  tds: '',
})
