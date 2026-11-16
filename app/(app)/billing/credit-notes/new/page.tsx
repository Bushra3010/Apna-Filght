import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { describeLine } from '@/lib/invoice'
import { CreditNoteForm, type OrigLine } from '../credit-note-form'

export const metadata = { title: 'New credit note' }

export default async function NewCreditNotePage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const { invoice } = await searchParams
  if (!invoice) notFound()
  const { supabase, org } = await getContext()
  const [{ data: inv }, { data: lines }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_no, bill_type, is_interstate, doc_kind, status, party:ledgers!invoices_party_ledger_id_fkey(name)')
      .eq('org_id', org.id)
      .eq('id', invoice)
      .maybeSingle(),
    supabase.from('invoice_lines').select('*, airlines(code)').eq('invoice_id', invoice).order('sort'),
  ])
  if (!inv || inv.doc_kind !== 'invoice' || inv.status !== 'posted') notFound()

  const orig: OrigLine[] = (lines ?? []).map((l) => ({
    id: l.id,
    label: l.pax_name || l.description || 'Line',
    detail: describeLine({ ...l, airline_code: (l.airlines as unknown as { code: string } | null)?.code }),
    basic: Number(l.basic),
    xt: Number(l.xt),
    service_fee: Number(l.service_fee),
    other_charges: Number(l.other_charges),
    gst_rate: Number(l.gst_rate),
    gst_on: (l.details as Record<string, string> | null)?.gst_on === 'full' ? 'full' : 'service',
    net_sale: Number(l.net_sale),
    has_supplier: !!l.supplier_ledger_id,
    purchase_gross: Number(l.purchase_gross),
    commission: Number(l.commission),
    tds: Number(l.tds),
  }))

  return (
    <>
      <PageHeader
        title={`Cancel / refund ${inv.invoice_no}`}
        description={`${(inv.party as unknown as { name: string }).name} · tick what is cancelled and enter what is refunded`}
      />
      <CreditNoteForm
        invoiceId={inv.id}
        invoiceNo={inv.invoice_no}
        lines={orig}
        interstate={inv.is_interstate}
        noGst={inv.bill_type === 'bill_of_supply'}
        today={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
      />
    </>
  )
}
