import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import type { QuoteDraft } from '@/lib/quotation'
import { QuotationForm } from '../quotation-form'
import { getQuotationOptions } from '../data'

export const metadata = { title: 'New quotation' }

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ lead?: string; itinerary?: string }> }) {
  const sp = await searchParams
  const { supabase, org } = await getContext()
  const opts = await getQuotationOptions()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const draft: QuoteDraft = {
    quote_date: today, lead_id: '', party_ledger_id: '', client_name: '', itinerary_id: '', route_id: '', package_title_id: '',
    meal_plan_id: '', start_date: '', nights: '', adults: '2', children: '0', infants: '0', gst_rate: '5', valid_until: '',
    inclusions: '', exclusions: '', terms: '', items: [],
  }
  let from = ''
  if (sp.lead) {
    const { data: l } = await supabase.from('leads').select('id, lead_no, guest_name, party_ledger_id, travel_date, adults, children_above_12, children_6_12, infants').eq('org_id', org.id).eq('id', sp.lead).maybeSingle()
    if (l) {
      from = `From lead ${l.lead_no}`
      Object.assign(draft, {
        lead_id: l.id, client_name: l.guest_name, party_ledger_id: l.party_ledger_id ?? '', start_date: l.travel_date ?? '',
        adults: String(l.adults + l.children_above_12), children: String(l.children_6_12), infants: String(l.infants),
      })
    }
  }
  const it = opts.itineraries.find((i) => i.id === sp.itinerary)
  if (it) Object.assign(draft, { itinerary_id: it.id, route_id: it.route_id ?? '', package_title_id: it.package_title_id ?? '', nights: String(it.nights) })
  return (
    <>
      <PageHeader title="New quotation" description={from || 'Price a holiday package from your rate masters'} />
      <QuotationForm draft={draft} {...opts} />
    </>
  )
}
