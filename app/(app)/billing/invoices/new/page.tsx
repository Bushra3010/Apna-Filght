import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { emptyLine, type InvoiceDraft } from '@/lib/invoice'
import { InvoiceForm } from '../invoice-form'
import { getInvoiceFormOptions } from '../data'

export const metadata = { title: 'New invoice' }

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { lead: leadId } = await searchParams
  const { supabase, org } = await getContext()
  const opts = await getInvoiceFormOptions()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const draft: InvoiceDraft = {
    bill_type: 'domestic',
    invoice_date: today,
    due_date: '',
    party_ledger_id: '',
    place_of_supply_state_id: opts.orgStateId ?? '',
    contact_phone: '',
    lead_id: '',
    notes: '',
    lines: [emptyLine()],
  }

  let fromLead = ''
  if (leadId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, lead_no, guest_name, phone, party_ledger_id, travel_date, adults, children_above_12, children_6_12, infants')
      .eq('org_id', org.id)
      .eq('id', leadId)
      .maybeSingle()
    if (lead) {
      fromLead = `${lead.lead_no} · ${lead.guest_name}`
      const party = opts.customers.find((c) => c.id === lead.party_ledger_id)
      draft.lead_id = lead.id
      draft.contact_phone = lead.phone
      if (party) {
        draft.party_ledger_id = party.id
        draft.place_of_supply_state_id = party.state_id ?? draft.place_of_supply_state_id
      }
      const pax = lead.adults + lead.children_above_12 + lead.children_6_12 + lead.infants
      draft.lines = Array.from({ length: Math.max(1, pax) }, (_, i) => ({
        ...emptyLine(),
        pax_name: i === 0 ? lead.guest_name.toUpperCase() : '',
        pax_type: i < lead.adults + lead.children_above_12 ? 'adult' : i < pax - lead.infants ? 'child' : 'infant',
        travel_date: lead.travel_date ?? '',
      }))
    }
  }

  return (
    <>
      <PageHeader title="New invoice" description={fromLead ? `From lead ${fromLead}` : 'Flight ticket invoice with GST'} />
      <InvoiceForm draft={draft} {...opts} />
    </>
  )
}
