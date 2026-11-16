import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { paiseToInput } from '@/lib/money'
import { BILL_TYPES, BILL_TYPE_KEYS, emptyLine, type BillType, type InvoiceDraft } from '@/lib/invoice'
import { InvoiceForm } from '../../invoices/invoice-form'
import { getInvoiceFormOptions } from '../../invoices/data'

export const metadata = { title: 'New proforma' }

export default async function NewProformaPage({ searchParams }: { searchParams: Promise<{ quotation?: string; type?: string }> }) {
  const sp = await searchParams
  const { supabase, org } = await getContext()
  const opts = await getInvoiceFormOptions()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const bt: BillType = BILL_TYPE_KEYS.includes(sp.type as BillType) ? (sp.type as BillType) : 'domestic'
  const draft: InvoiceDraft = {
    doc_kind: 'proforma', bill_type: bt, invoice_date: today, due_date: '', party_ledger_id: '',
    place_of_supply_state_id: opts.orgStateId ?? '', booked_by_id: '', contact_phone: '', lead_id: '', notes: '', lines: [emptyLine(bt)],
  }
  let from = ''
  if (sp.quotation) {
    const { data: q } = await supabase
      .from('quotations')
      .select('id, quote_no, client_name, party_ledger_id, lead_id, start_date, nights, adults, children, subtotal, gst_rate, routes(name), ptitle:lookups!quotations_package_title_id_fkey(name)')
      .eq('org_id', org.id).eq('id', sp.quotation).maybeSingle()
    if (q) {
      from = `From quotation ${q.quote_no}`
      const party = opts.customers.find((c) => c.id === q.party_ledger_id)
      const title = (q.ptitle as unknown as { name: string } | null)?.name ?? (q.routes as unknown as { name: string } | null)?.name ?? 'Holiday package'
      const end = q.start_date && q.nights !== null ? new Date(new Date(q.start_date).getTime() + q.nights * 86400000).toISOString().slice(0, 10) : ''
      const rate = String(Number(q.gst_rate))
      Object.assign(draft, {
        bill_type: 'tour', quotation_id: q.id, party_ledger_id: party?.id ?? '', lead_id: q.lead_id ?? '',
        place_of_supply_state_id: party?.state_id ?? draft.place_of_supply_state_id, contact_phone: party?.mobile ?? '',
        notes: `As per quotation ${q.quote_no}`,
        lines: [{
          ...emptyLine('tour'),
          pax_name: q.client_name.toUpperCase(),
          fields: { description: title, travel_date: q.start_date ?? '', return_date: end, pax_count: String(q.adults + q.children) },
          basic: paiseToInput(q.subtotal),
          gst_rate: ['0', '5', '12', '18', '28'].includes(rate) ? rate : '5',
          gst_on: 'full',
        }],
      } satisfies Partial<InvoiceDraft>)
    }
  }
  return (
    <>
      <PageHeader title="New proforma" description={from || `${BILL_TYPES[draft.bill_type].label} · does not affect the accounts until converted`} />
      <InvoiceForm draft={draft} {...opts} />
    </>
  )
}
