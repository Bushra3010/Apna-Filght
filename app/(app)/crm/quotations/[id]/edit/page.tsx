import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { paiseToInput } from '@/lib/money'
import type { QuoteDraft, QuoteItemKind } from '@/lib/quotation'
import { QuotationForm } from '../../quotation-form'
import { getQuotationOptions } from '../../data'

export const metadata = { title: 'Edit quotation' }

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: q }, { data: items }, opts] = await Promise.all([
    supabase.from('quotations').select('*').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('quotation_items').select('*').eq('quotation_id', id).order('sort'),
    getQuotationOptions(),
  ])
  if (!q) notFound()
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const draft: QuoteDraft = {
    id: q.id, quote_date: q.quote_date, lead_id: s(q.lead_id), party_ledger_id: s(q.party_ledger_id), client_name: q.client_name,
    itinerary_id: s(q.itinerary_id), route_id: s(q.route_id), package_title_id: s(q.package_title_id), meal_plan_id: s(q.meal_plan_id),
    start_date: s(q.start_date), nights: s(q.nights), adults: s(q.adults), children: s(q.children), infants: s(q.infants),
    gst_rate: String(Number(q.gst_rate)), valid_until: s(q.valid_until), inclusions: s(q.inclusions), exclusions: s(q.exclusions), terms: s(q.terms),
    items: (items ?? []).map((it) => ({
      kind: it.kind as QuoteItemKind, day_no: s(it.day_no), description: it.description, hotel_rate_id: s(it.hotel_rate_id),
      activity_rate_id: s(it.activity_rate_id), vehicle_id: s(it.vehicle_id), qty: String(Number(it.qty)),
      unit_cost: paiseToInput(it.unit_cost), unit_price: paiseToInput(it.unit_price),
    })),
  }
  return (
    <>
      <PageHeader title={`Edit ${q.quote_no}`} />
      <QuotationForm draft={draft} {...opts} />
    </>
  )
}
