import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { BILL_TYPES, BILL_TYPE_KEYS, emptyLine, type BillType, type InvoiceDraft } from '@/lib/invoice'
import { InvoiceForm } from '../invoice-form'
import { getInvoiceFormOptions } from '../data'

export const metadata = { title: 'New invoice' }

// which invoice type to start with for a lead's first service
const TYPE_FOR_SERVICE: Record<string, BillType> = {
  flight: 'domestic', hotel: 'hotel', visa: 'visa_insurance', tour_package: 'tour',
  transport: 'taxi', train_bus: 'train_bus', activities: 'misc_service', other: 'misc_service',
}

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ lead?: string; type?: string }> }) {
  const { lead: leadId, type } = await searchParams
  const { supabase, org } = await getContext()
  const opts = await getInvoiceFormOptions()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  let bt: BillType = BILL_TYPE_KEYS.includes(type as BillType) ? (type as BillType) : 'domestic'
  const draft: InvoiceDraft = {
    bill_type: bt,
    invoice_date: today,
    due_date: '',
    party_ledger_id: '',
    place_of_supply_state_id: opts.orgStateId ?? '',
    booked_by_id: '',
    contact_phone: '',
    lead_id: '',
    notes: '',
    lines: [emptyLine(bt)],
  }

  let fromLead = ''
  if (leadId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, lead_no, guest_name, phone, party_ledger_id, travel_date, services, adults, children_above_12, children_6_12, infants')
      .eq('org_id', org.id)
      .eq('id', leadId)
      .maybeSingle()
    if (lead) {
      fromLead = `${lead.lead_no} · ${lead.guest_name}`
      if (!type && lead.services?.length) bt = TYPE_FOR_SERVICE[lead.services[0]] ?? 'domestic'
      draft.bill_type = bt
      const party = opts.customers.find((c) => c.id === lead.party_ledger_id)
      draft.lead_id = lead.id
      draft.contact_phone = lead.phone
      if (party) {
        draft.party_ledger_id = party.id
        draft.place_of_supply_state_id = party.state_id ?? draft.place_of_supply_state_id
      }
      const pax = lead.adults + lead.children_above_12 + lead.children_6_12 + lead.infants
      const perPax = ['domestic', 'international', 'train_bus', 'visa_insurance'].includes(bt)
      draft.lines = Array.from({ length: perPax ? Math.max(1, pax) : 1 }, (_, i) => ({
        ...emptyLine(bt),
        pax_name: i === 0 ? lead.guest_name.toUpperCase() : '',
        pax_type: i < lead.adults + lead.children_above_12 ? 'adult' : i < pax - lead.infants ? 'child' : 'infant',
        fields: { travel_date: lead.travel_date ?? '', ...(bt === 'tour' ? { pax_count: String(pax) } : {}) },
      }))
    }
  }

  return (
    <>
      <PageHeader title="New invoice" description={fromLead ? `From lead ${fromLead}` : BILL_TYPES[bt].label} />
      <InvoiceForm draft={draft} {...opts} />
    </>
  )
}
