import { Page, Text, View } from '@react-pdf/renderer'
import { formatAmount, formatINR } from '@/lib/money'
import { amountInWords } from '@/lib/words'
import { describeLine } from '@/lib/invoice'
import { CompanyBlock, dateIN, KV, PageFooter, s, type Company } from './kit'

export type Line = {
  id: string; service: string; pax_name: string | null; pax_type: string | null; description: string | null
  basic: number; xt: number; service_fee: number; other_charges: number; discount: number
  cgst: number; sgst: number; igst: number; gst_rate: number; net_sale: number
  flight_no: string | null; sector: string | null; travel_date: string | null; return_date: string | null
  pnr: string | null; ticket_no: string | null; details: Record<string, unknown> | null; airlines: { code: string } | null
}
export type InvoiceData = {
  inv: Record<string, never> & {
    id: string; invoice_no: string; invoice_date: string; due_date: string | null; doc_kind: string; bill_type: string
    is_interstate: boolean; taxable: number; cgst: number; sgst: number; igst: number; total: number; notes: string | null; contact_phone: string | null
    party: { name: string; gstin: string | null; address: string | null; mobile: string | null }
    pos: { name: string; gst_code: string } | null
    ref: { invoice_no: string; invoice_date: string } | null
  }
  lines: Line[]
  company: Company & { invoice_terms: string | null }
}

export function invoiceTitle(doc_kind: string, bill_type: string) {
  return doc_kind === 'credit_note' ? 'CREDIT NOTE' : doc_kind === 'proforma' ? 'PROFORMA INVOICE' : bill_type === 'bill_of_supply' ? 'BILL OF SUPPLY' : 'TAX INVOICE'
}

export function InvoicePage({ d }: { d: InvoiceData }) {
  const { inv, lines, company: c } = d
  const isCN = inv.doc_kind === 'credit_note'
  const noGst = inv.bill_type === 'bill_of_supply'
  const inter = inv.is_interstate
  const hasXt = lines.some((l) => Number(l.xt) !== 0)
  const w = { n: 18, amt: 62, gst: 62, total: 70 }
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <CompanyBlock c={c} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.title}>{invoiceTitle(inv.doc_kind, inv.bill_type)}</Text>
          <Text>No. <Text style={s.bold}>{inv.invoice_no}</Text></Text>
          <Text>Date {dateIN(inv.invoice_date)}</Text>
          {inv.ref && <Text>Against {inv.ref.invoice_no} of {dateIN(inv.ref.invoice_date)}</Text>}
          {inv.due_date && <Text>Due {dateIN(inv.due_date)}</Text>}
        </View>
      </View>

      <View style={[s.between, { marginBottom: 10 }]}>
        <View style={{ maxWidth: 300 }}>
          <Text style={s.label}>{isCN ? 'Issued to' : 'Bill to'}</Text>
          <Text style={s.bold}>{inv.party.name}</Text>
          {inv.party.address && <Text>{inv.party.address}</Text>}
          {inv.party.gstin && <Text>GSTIN: {inv.party.gstin}</Text>}
          {(inv.contact_phone || inv.party.mobile) && <Text>{inv.contact_phone || inv.party.mobile}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.label}>Place of supply</Text>
          <Text>{inv.pos ? `${inv.pos.gst_code} – ${inv.pos.name}` : '—'}</Text>
        </View>
      </View>

      <View style={[s.tr, { borderBottomWidth: 1 }]} fixed>
        <Text style={[s.th, { width: w.n }]}>#</Text>
        <Text style={[s.th, { flex: 1 }]}>Particulars</Text>
        <Text style={[s.th, s.right, { width: w.amt }]}>Basic</Text>
        {hasXt && <Text style={[s.th, s.right, { width: w.amt }]}>Taxes</Text>}
        <Text style={[s.th, s.right, { width: w.amt }]}>Fee + charges</Text>
        {!noGst && <Text style={[s.th, s.right, { width: w.gst }]}>{inter ? 'IGST' : 'CGST + SGST'}</Text>}
        <Text style={[s.th, s.right, { width: w.total, paddingRight: 0 }]}>Amount</Text>
      </View>
      {lines.map((l, i) => (
        <View key={l.id} style={s.tr} wrap={false}>
          <Text style={[s.td, { width: w.n }]}>{i + 1}</Text>
          <View style={[s.td, { flex: 1 }]}>
            <Text style={s.bold}>
              {l.service === 'cancellation_charge' ? 'Cancellation charges' : l.pax_name || l.description}
              {l.pax_type && l.pax_type !== 'adult' ? ` (${l.pax_type})` : ''}
            </Text>
            {l.service !== 'cancellation_charge' && (
              <Text style={s.muted}>{describeLine({ ...l, airline_code: l.airlines?.code, description: l.pax_name ? l.description : null })}</Text>
            )}
          </View>
          <Text style={[s.td, s.right, { width: w.amt }]}>{formatAmount(l.basic)}</Text>
          {hasXt && <Text style={[s.td, s.right, { width: w.amt }]}>{formatAmount(l.xt)}</Text>}
          <Text style={[s.td, s.right, { width: w.amt }]}>{formatAmount(Number(l.service_fee) + Number(l.other_charges) - Number(l.discount))}</Text>
          {!noGst && (
            <View style={[s.td, { width: w.gst }]}>
              <Text style={s.right}>{formatAmount(Number(l.cgst) + Number(l.sgst) + Number(l.igst))}</Text>
              <Text style={[s.right, s.muted]}>@{Number(l.gst_rate)}%</Text>
            </View>
          )}
          <Text style={[s.td, s.right, s.bold, { width: w.total, paddingRight: 0 }]}>{formatAmount(l.net_sale)}</Text>
        </View>
      ))}

      <View style={[s.row, s.section, { gap: 24 }]} wrap={false}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>Amount in words</Text>
          <Text style={s.bold}>{amountInWords(inv.total)}</Text>
          {inv.notes && <Text style={{ marginTop: 8 }}>{inv.notes}</Text>}
        </View>
        <View style={{ width: 200 }}>
          {!noGst && <KV k="Taxable value" v={formatAmount(inv.taxable)} />}
          {!noGst && (inter ? <KV k="IGST" v={formatAmount(inv.igst)} /> : <><KV k="CGST" v={formatAmount(inv.cgst)} /><KV k="SGST" v={formatAmount(inv.sgst)} /></>)}
          <KV k={isCN ? 'Refund' : 'Total'} v={formatINR(inv.total)} strong top />
        </View>
      </View>

      {c.invoice_terms && !isCN && (
        <View style={[s.section, { borderTopWidth: 0.5, borderTopColor: '#d9dedf', paddingTop: 8 }]} wrap={false}>
          <Text style={[s.muted, { fontSize: 7.5 }]}>{c.invoice_terms}</Text>
        </View>
      )}
      <Text style={[s.right, s.muted, { marginTop: 28, fontSize: 8 }]}>For {c.legal_name || c.name} — Authorised signatory</Text>
      <PageFooter left={`${inv.invoice_no} · computer-generated document`} />
    </Page>
  )
}
