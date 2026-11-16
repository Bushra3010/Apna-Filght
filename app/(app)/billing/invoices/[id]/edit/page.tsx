import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { paiseToInput } from '@/lib/money'
import { BILL_TYPES, LINE_COLUMNS, type BillType, type InvoiceDraft, type LineDraft } from '@/lib/invoice'
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
  if (!inv || inv.status === 'cancelled' || inv.doc_kind === 'credit_note' || inv.converted_to_invoice_id) notFound()
  const cfg = BILL_TYPES[inv.bill_type as BillType]

  const s = (v: string | null | undefined) => v ?? ''
  const draft: InvoiceDraft = {
    id: inv.id,
    doc_kind: inv.doc_kind,
    bill_type: inv.bill_type,
    invoice_date: inv.invoice_date,
    due_date: s(inv.due_date),
    party_ledger_id: inv.party_ledger_id,
    place_of_supply_state_id: s(inv.place_of_supply_state_id),
    booked_by_id: s(inv.booked_by_id),
    contact_phone: s(inv.contact_phone),
    lead_id: s(inv.lead_id),
    notes: s(inv.notes),
    lines: (lines ?? []).map((l): LineDraft => {
      const details = (l.details ?? {}) as Record<string, string>
      const fields: Record<string, string> = {}
      for (const f of cfg.fields) {
        fields[f.key] = (LINE_COLUMNS as readonly string[]).includes(f.key) ? s(l[f.key]) : s(details[f.key])
      }
      return {
        service: l.service,
        pax_name: s(l.pax_name),
        pax_type: l.pax_type ?? 'adult',
        fields,
        basic: paiseToInput(l.basic),
        xt: paiseToInput(l.xt),
        service_fee: paiseToInput(l.service_fee),
        other_charges: paiseToInput(l.other_charges),
        discount: paiseToInput(l.discount),
        gst_rate: String(Number(l.gst_rate)),
        gst_on: details.gst_on === 'full' ? 'full' : details.gst_on === 'service' ? 'service' : cfg.gstOn,
        supplier_ledger_id: s(l.supplier_ledger_id),
        supplier_invoice_no: s(l.supplier_invoice_no),
        purchase_gross: paiseToInput(l.purchase_gross),
        purchase_gst: paiseToInput(l.purchase_gst),
        commission: paiseToInput(l.commission),
        tds: paiseToInput(l.tds),
      }
    }),
  }
  return (
    <>
      <PageHeader title={`Edit ${inv.invoice_no}`} description={inv.doc_kind === 'proforma' ? 'Proformas do not affect the accounts.' : 'Saving re-posts the invoice to the accounts.'} />
      <InvoiceForm draft={draft} {...opts} />
    </>
  )
}
