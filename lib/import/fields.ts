// What each import can read, and the header names suppliers commonly use.
import { norm } from './values'

export type ImportField = { key: string; label: string; required?: boolean; kind?: 'date' | 'money' | 'text'; synonyms: string[] }

export const BILLING_FIELDS: ImportField[] = [
  { key: 'invoice_date', label: 'Booking / issue date', kind: 'date', synonyms: ['bookingdate', 'issuedate', 'dateofissue', 'invoicedate', 'billdate', 'date', 'txndate', 'transactiondate'] },
  { key: 'client', label: 'Client / agency', synonyms: ['client', 'customer', 'clientname', 'customername', 'agency', 'agent', 'party', 'company', 'corporate'] },
  { key: 'pax_name', label: 'Passenger name', required: true, synonyms: ['paxname', 'passengername', 'passenger', 'pax', 'travellername', 'traveller', 'name', 'guestname'] },
  { key: 'pax_type', label: 'Passenger type (ADT/CHD/INF)', synonyms: ['paxtype', 'passengertype', 'type'] },
  { key: 'airline', label: 'Airline (code or name)', synonyms: ['airline', 'airlinecode', 'carrier', 'airlinename', 'al'] },
  { key: 'flight_no', label: 'Flight no.', synonyms: ['flightno', 'flightnumber', 'flight', 'flightnum'] },
  { key: 'sector', label: 'Sector / route', synonyms: ['sector', 'route', 'origindestination', 'fromto', 'journey', 'routing'] },
  { key: 'travel_date', label: 'Travel date', kind: 'date', synonyms: ['traveldate', 'journeydate', 'departuredate', 'depdate', 'flightdate', 'dateoftravel', 'onwarddate'] },
  { key: 'return_date', label: 'Return date', kind: 'date', synonyms: ['returndate', 'inwarddate', 'arrivaldate'] },
  { key: 'pnr', label: 'PNR', synonyms: ['pnr', 'airlinepnr', 'gdspnr', 'bookingref', 'bookingreference', 'pnrno'] },
  { key: 'ticket_no', label: 'Ticket no.', synonyms: ['ticketno', 'ticketnumber', 'ticket', 'eticket', 'tktno', 'etktno'] },
  { key: 'basic', label: 'Base fare', kind: 'money', synonyms: ['basefare', 'basic', 'basicfare', 'fare', 'bf'] },
  { key: 'xt', label: 'Airline taxes (YQ / XT / K3)', kind: 'money', synonyms: ['taxes', 'tax', 'xt', 'yq', 'totaltax', 'airlinetax', 'taxesandfees', 'othertaxes', 'k3'] },
  { key: 'service_fee', label: 'Your service fee', kind: 'money', synonyms: ['servicefee', 'servicecharge', 'fee', 'markup', 'transactionfee', 'tf', 'mgmtfee'] },
  { key: 'other_charges', label: 'Other charges', kind: 'money', synonyms: ['othercharges', 'meal', 'baggage', 'seat', 'ssr', 'convenience', 'conveniencefee'] },
  { key: 'discount', label: 'Discount to client', kind: 'money', synonyms: ['discount', 'clientdiscount'] },
  { key: 'supplier', label: 'Supplier / consolidator', synonyms: ['supplier', 'vendor', 'consolidator', 'portal', 'source'] },
  { key: 'supplier_invoice_no', label: 'Supplier invoice no.', synonyms: ['supplierinvoiceno', 'supplierinvoice', 'invoiceno', 'invoicenumber', 'billno', 'refno', 'reference'] },
  { key: 'purchase_gross', label: 'Purchase cost (what you pay)', kind: 'money', synonyms: ['netfare', 'netamount', 'netpayable', 'purchase', 'purchaseamount', 'cost', 'payable', 'nettotal', 'agentnet', 'totalpayable'] },
  { key: 'commission', label: 'Commission earned', kind: 'money', synonyms: ['commission', 'comm', 'iata', 'plb', 'earnings', 'incentive'] },
  { key: 'tds', label: 'TDS on commission', kind: 'money', synonyms: ['tds', 'tdsoncommission', 'tdsamount'] },
]

export const VOUCHER_FIELDS: ImportField[] = [
  { key: 'date', label: 'Date', kind: 'date', required: true, synonyms: ['date', 'txndate', 'transactiondate', 'valuedate', 'paymentdate', 'receiptdate'] },
  { key: 'party', label: 'Party (client / supplier)', required: true, synonyms: ['party', 'client', 'customer', 'name', 'supplier', 'paidby', 'paidto', 'payer', 'payee', 'account'] },
  { key: 'amount', label: 'Amount', kind: 'money', required: true, synonyms: ['amount', 'amt', 'credit', 'debit', 'received', 'paid', 'value'] },
  { key: 'mode', label: 'Mode (cash/UPI/NEFT/cheque)', synonyms: ['mode', 'paymentmode', 'method', 'channel'] },
  { key: 'reference', label: 'Reference / UTR / cheque no.', synonyms: ['reference', 'ref', 'utr', 'utrno', 'chequeno', 'transactionid', 'txnid', 'refno'] },
  { key: 'narration', label: 'Narration', synonyms: ['narration', 'remarks', 'remark', 'description', 'notes', 'particulars'] },
]

export const LEDGER_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', required: true, synonyms: ['name', 'ledgername', 'partyname', 'clientname', 'customername', 'suppliername', 'company'] },
  { key: 'kind', label: 'Type (client/supplier/bank/expense)', synonyms: ['type', 'ledgertype', 'kind', 'group', 'category'] },
  { key: 'gstin', label: 'GSTIN', synonyms: ['gstin', 'gst', 'gstno', 'gstnumber'] },
  { key: 'pan', label: 'PAN', synonyms: ['pan', 'panno', 'pannumber'] },
  { key: 'state', label: 'State (name or GST code)', synonyms: ['state', 'statename', 'statecode'] },
  { key: 'mobile', label: 'Mobile', synonyms: ['mobile', 'mobileno', 'phone', 'phoneno', 'contact', 'contactno', 'whatsapp'] },
  { key: 'email', label: 'Email', synonyms: ['email', 'emailid', 'mail'] },
  { key: 'address', label: 'Address', synonyms: ['address', 'addr', 'city'] },
  { key: 'credit_days', label: 'Credit days', synonyms: ['creditdays', 'credit', 'terms', 'creditperiod'] },
  { key: 'opening', label: 'Opening balance (+ owed to you, − you owe)', kind: 'money', synonyms: ['opening', 'openingbalance', 'balance', 'ob'] },
]

/** First header that matches a field's synonyms (exact, then contains), each header used once. */
export function guessMapping(headers: string[], fields: ImportField[]): Record<string, string> {
  const used = new Set<string>()
  const out: Record<string, string> = {}
  const pick = (f: ImportField, test: (h: string, s: string) => boolean) => {
    if (out[f.key]) return
    for (const s of f.synonyms) {
      const h = headers.find((x) => !used.has(x) && test(norm(x), s))
      if (h) { out[f.key] = h; used.add(h); return }
    }
  }
  for (const f of fields) pick(f, (h, s) => h === s)
  for (const f of fields) pick(f, (h, s) => s.length >= 4 && h.includes(s))
  return out
}
