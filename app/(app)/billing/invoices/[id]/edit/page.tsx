import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { paiseToInput } from '@/lib/money'
import type { InvoiceDraft, LineDraft } from '@/lib/invoice'
import { InvoiceForm } from '../../invoice-form'
import { getInvoiceFormOptions } from '../../data'

export const metadata = { title: 'Edit invoice' }

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: inv }, { data: lines }, opts] = await Promise.all([
    supabase.from('invoices').select('*').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('sort'),
    getInvoiceFormOptions(),
  ])
  if (!inv || inv.status === 'cancelled' || inv.doc_kind !== 'invoice') notFound()

  const s = (v: string | null) => v ?? ''
  const draft: InvoiceDraft = {
    id: inv.id,
    bill_type: inv.bill_type,
    invoice_date: inv.invoice_date,
    due_date: s(inv.due_date),
    party_ledger_id: inv.party_ledger_id,
    place_of_supply_state_id: s(inv.place_of_supply_state_id),
    contact_phone: s(inv.contact_phone),
    lead_id: s(inv.lead_id),
    notes: s(inv.notes),
    lines: (lines ?? []).map(
      (l): LineDraft => ({
        pax_name: s(l.pax_name),
        pax_type: l.pax_type ?? 'adult',
        airline_id: s(l.airline_id),
        flight_no: s(l.flight_no),
        sector: s(l.sector),
        travel_date: s(l.travel_date),
        return_date: s(l.return_date),
        pnr: s(l.pnr),
        ticket_no: s(l.ticket_no),
        basic: paiseToInput(l.basic),
        xt: paiseToInput(l.xt),
        service_fee: paiseToInput(l.service_fee),
        other_charges: paiseToInput(l.other_charges),
        discount: paiseToInput(l.discount),
        gst_rate: String(Number(l.gst_rate)),
        supplier_ledger_id: s(l.supplier_ledger_id),
        supplier_invoice_no: s(l.supplier_invoice_no),
        purchase_gross: paiseToInput(l.purchase_gross),
        purchase_gst: paiseToInput(l.purchase_gst),
        commission: paiseToInput(l.commission),
        tds: paiseToInput(l.tds),
      }),
    ),
  }
  return (
    <>
      <PageHeader title={`Edit ${inv.invoice_no}`} description="Saving re-posts the invoice to the accounts." />
      <InvoiceForm draft={draft} {...opts} />
    </>
  )
}
