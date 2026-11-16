// Invoice types, their line layouts, and the draft shapes shared by the
// invoice form (client) and the save action (server).
// Amounts in drafts are rupee strings as typed; the server converts to paise.
import type { GstOn } from './gst'

export type BillType =
  | 'domestic' | 'international' | 'hotel' | 'visa_insurance' | 'train_bus'
  | 'taxi' | 'misc_service' | 'bill_of_supply' | 'tour' | 'commission'

export type Service = 'flight' | 'hotel' | 'visa' | 'insurance' | 'train' | 'bus' | 'taxi' | 'misc' | 'tour' | 'commission'

/** Where a line field is stored: a real column, or inside invoice_lines.details (jsonb). */
export type LineField = {
  key: string
  label: string
  type?: 'text' | 'date' | 'number' | 'airline'
  upper?: boolean
  wide?: boolean
  required?: boolean
  placeholder?: string
}

export type BillTypeConfig = {
  label: string
  services: Service[]
  paxLabel: string
  fields: LineField[]
  amounts: { basic: string; xt?: string }
  gstOn: GstOn
  gstRate: number
  noGst?: boolean
  purchase: boolean
}

const flightFields: LineField[] = [
  { key: 'airline_id', label: 'Airline', type: 'airline' },
  { key: 'flight_no', label: 'Flight no.', upper: true },
  { key: 'sector', label: 'Sector', upper: true, placeholder: 'DEL-BOM' },
  { key: 'travel_date', label: 'Travel date', type: 'date' },
  { key: 'return_date', label: 'Return date', type: 'date' },
  { key: 'pnr', label: 'PNR', upper: true },
  { key: 'ticket_no', label: 'Ticket no.' },
]

export const BILL_TYPES: Record<BillType, BillTypeConfig> = {
  domestic: {
    label: 'Domestic flight', services: ['flight'], paxLabel: 'Passenger name', fields: flightFields,
    amounts: { basic: 'Base fare', xt: 'Taxes (XT)' }, gstOn: 'service', gstRate: 18, purchase: true,
  },
  international: {
    label: 'International flight', services: ['flight'], paxLabel: 'Passenger name', fields: flightFields,
    amounts: { basic: 'Base fare', xt: 'Taxes (XT)' }, gstOn: 'service', gstRate: 18, purchase: true,
  },
  hotel: {
    label: 'Hotel', services: ['hotel'], paxLabel: 'Guest name',
    fields: [
      { key: 'hotel', label: 'Hotel', wide: true, required: true },
      { key: 'city', label: 'City' },
      { key: 'travel_date', label: 'Check-in', type: 'date' },
      { key: 'return_date', label: 'Check-out', type: 'date' },
      { key: 'rooms', label: 'Rooms', type: 'number' },
      { key: 'room_type', label: 'Room type' },
      { key: 'meal_plan', label: 'Meal plan' },
      { key: 'ticket_no', label: 'Confirmation no.' },
    ],
    amounts: { basic: 'Room tariff' }, gstOn: 'full', gstRate: 18, purchase: true,
  },
  visa_insurance: {
    label: 'Visa / insurance', services: ['visa', 'insurance'], paxLabel: 'Applicant name',
    fields: [
      { key: 'country', label: 'Country' },
      { key: 'visa_type', label: 'Visa type / plan' },
      { key: 'passport_no', label: 'Passport no.', upper: true },
      { key: 'travel_date', label: 'Travel / start date', type: 'date' },
      { key: 'return_date', label: 'Valid till', type: 'date' },
      { key: 'ticket_no', label: 'Application / policy no.' },
    ],
    amounts: { basic: 'Visa / premium fee' }, gstOn: 'service', gstRate: 18, purchase: true,
  },
  train_bus: {
    label: 'Train / bus', services: ['train', 'bus'], paxLabel: 'Passenger name',
    fields: [
      { key: 'flight_no', label: 'Train / bus no.', upper: true },
      { key: 'sector', label: 'From – to', upper: true, placeholder: 'NDLS-BCT' },
      { key: 'travel_date', label: 'Journey date', type: 'date' },
      { key: 'class', label: 'Class' },
      { key: 'pnr', label: 'PNR', upper: true },
      { key: 'ticket_no', label: 'Ticket no.' },
    ],
    amounts: { basic: 'Fare', xt: 'Operator charges' }, gstOn: 'service', gstRate: 18, purchase: true,
  },
  taxi: {
    label: 'Taxi / transport', services: ['taxi'], paxLabel: 'Guest name',
    fields: [
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'sector', label: 'Route', upper: true, wide: true },
      { key: 'travel_date', label: 'From date', type: 'date' },
      { key: 'return_date', label: 'To date', type: 'date' },
      { key: 'km', label: 'KM / days' },
    ],
    amounts: { basic: 'Charges' }, gstOn: 'full', gstRate: 5, purchase: true,
  },
  misc_service: {
    label: 'Misc / service', services: ['misc'], paxLabel: 'Guest / reference',
    fields: [{ key: 'description', label: 'Description', wide: true, required: true }, { key: 'travel_date', label: 'Date', type: 'date' }],
    amounts: { basic: 'Amount' }, gstOn: 'full', gstRate: 18, purchase: true,
  },
  bill_of_supply: {
    label: 'Bill of supply (no GST)', services: ['misc'], paxLabel: 'Guest / reference',
    fields: [{ key: 'description', label: 'Description', wide: true, required: true }, { key: 'travel_date', label: 'Date', type: 'date' }],
    amounts: { basic: 'Amount' }, gstOn: 'full', gstRate: 0, noGst: true, purchase: true,
  },
  tour: {
    label: 'Tour package', services: ['tour'], paxLabel: 'Lead guest',
    fields: [
      { key: 'description', label: 'Package / destination', wide: true, required: true },
      { key: 'travel_date', label: 'Start date', type: 'date' },
      { key: 'return_date', label: 'End date', type: 'date' },
      { key: 'pax_count', label: 'Pax', type: 'number' },
    ],
    amounts: { basic: 'Package cost' }, gstOn: 'full', gstRate: 5, purchase: true,
  },
  commission: {
    label: 'Commission', services: ['commission'], paxLabel: 'Reference',
    fields: [{ key: 'description', label: 'Commission for', wide: true, required: true }, { key: 'travel_date', label: 'Period / date', type: 'date' }],
    amounts: { basic: 'Commission' }, gstOn: 'full', gstRate: 18, purchase: false,
  },
}

export const BILL_TYPE_KEYS = Object.keys(BILL_TYPES) as BillType[]

/** Real invoice_lines columns that line fields may map to; anything else goes in details. */
export const LINE_COLUMNS = ['airline_id', 'flight_no', 'sector', 'travel_date', 'return_date', 'pnr', 'ticket_no', 'description'] as const

export type LineDraft = {
  service: Service
  pax_name: string
  pax_type: 'adult' | 'child' | 'infant'
  fields: Record<string, string>
  basic: string
  xt: string
  service_fee: string
  other_charges: string
  discount: string
  gst_rate: string
  gst_on: GstOn
  supplier_ledger_id: string
  supplier_invoice_no: string
  purchase_gross: string
  purchase_gst: string
  commission: string
  tds: string
}

export type InvoiceDraft = {
  id?: string
  doc_kind?: 'invoice' | 'proforma'
  quotation_id?: string
  bill_type: BillType
  invoice_date: string
  due_date: string
  party_ledger_id: string
  place_of_supply_state_id: string
  booked_by_id: string
  contact_phone: string
  lead_id: string
  notes: string
  lines: LineDraft[]
}

export const emptyLine = (bt: BillType = 'domestic'): LineDraft => ({
  service: BILL_TYPES[bt].services[0],
  pax_name: '',
  pax_type: 'adult',
  fields: {},
  basic: '',
  xt: '',
  service_fee: '',
  other_charges: '',
  discount: '',
  gst_rate: String(BILL_TYPES[bt].gstRate),
  gst_on: BILL_TYPES[bt].gstOn,
  supplier_ledger_id: '',
  supplier_invoice_no: '',
  purchase_gross: '',
  purchase_gst: '',
  commission: '',
  tds: '',
})

/** One-line description of an invoice line for prints and lists. */
export function describeLine(l: {
  service: string
  description?: string | null
  flight_no?: string | null
  sector?: string | null
  travel_date?: string | null
  return_date?: string | null
  pnr?: string | null
  ticket_no?: string | null
  details?: Record<string, unknown> | null
  airline_code?: string | null
}): string {
  const d = (l.details ?? {}) as Record<string, string>
  const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN') : null)
  const parts: (string | null | undefined | false)[] =
    l.service === 'hotel'
      ? [d.hotel, d.city, l.travel_date && `${date(l.travel_date)} → ${date(l.return_date)}`, d.rooms && `${d.rooms} room(s)`, d.room_type, d.meal_plan, l.ticket_no && `Conf. ${l.ticket_no}`]
      : l.service === 'visa' || l.service === 'insurance'
        ? [l.service === 'visa' ? 'Visa' : 'Insurance', d.country, d.visa_type, d.passport_no && `PP ${d.passport_no}`, date(l.travel_date), l.ticket_no]
        : l.service === 'taxi'
          ? [d.vehicle, l.sector, l.travel_date && `${date(l.travel_date)}${l.return_date ? ` → ${date(l.return_date)}` : ''}`, d.km]
          : l.service === 'tour'
            ? [l.description, l.travel_date && `${date(l.travel_date)}${l.return_date ? ` → ${date(l.return_date)}` : ''}`, d.pax_count && `${d.pax_count} pax`]
            : l.service === 'flight' || l.service === 'train' || l.service === 'bus'
              ? [[l.airline_code, l.flight_no].filter(Boolean).join(' ') || null, l.sector, date(l.travel_date), d.class, l.pnr && `PNR ${l.pnr}`, l.ticket_no && `Tkt ${l.ticket_no}`]
              : [l.description, date(l.travel_date)]
  return parts.filter(Boolean).join(' · ')
}
