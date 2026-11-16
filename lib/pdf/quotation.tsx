import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Page, Text, View } from '@react-pdf/renderer'
import { formatINR } from '@/lib/money'
import { CompanyBlock, dateIN, KV, PageFooter, s, type Company } from './kit'
import { loadCompany } from './invoice'

const KIND: Record<string, string> = { hotel: 'Accommodation', activity: 'Sightseeing & activities', vehicle: 'Transport', flight: 'Flights', visa: 'Visa', insurance: 'Insurance', other: 'Other' }

type Q = {
  quote_no: string; quote_date: string; valid_until: string | null; client_name: string; start_date: string | null; nights: number | null
  adults: number; children: number; infants: number; subtotal: number; tax_total: number; gst_rate: number; grand_total: number
  inclusions: string | null; exclusions: string | null; terms: string | null; itinerary_id: string | null
  routes: { name: string } | null; ptitle: { name: string } | null; meal: { name: string } | null
}
export type QuotationData = {
  q: Q
  items: { kind: string; description: string }[]
  days: { day_no: number; title: string; description: string | null; cities: { name: string } | null }[]
  company: Company
}

export async function loadQuotation(supabase: SupabaseClient, orgId: string, id: string): Promise<QuotationData | null> {
  const [{ data: q }, { data: items }, company] = await Promise.all([
    supabase.from('quotations').select('*, routes(name), ptitle:lookups!quotations_package_title_id_fkey(name), meal:lookups!quotations_meal_plan_id_fkey(name)').eq('org_id', orgId).eq('id', id).maybeSingle(),
    supabase.from('quotation_items').select('kind, description').eq('quotation_id', id).order('day_no', { nullsFirst: false }).order('sort'),
    loadCompany(supabase, orgId),
  ])
  if (!q || !company) return null
  const { data: days } = q.itinerary_id
    ? await supabase.from('itinerary_days').select('day_no, title, description, cities(name)').eq('itinerary_id', q.itinerary_id).order('day_no')
    : { data: [] }
  return { q: q as Q, items: items ?? [], days: (days ?? []) as unknown as QuotationData['days'], company }
}

function H({ children }: { children: string }) {
  return <Text style={[s.label, { marginTop: 14, marginBottom: 4 }]}>{children}</Text>
}

export function QuotationPage({ d }: { d: QuotationData }) {
  const { q, items, days, company: c } = d
  const pax = q.adults + q.children
  const end = q.start_date && q.nights !== null ? new Date(new Date(`${q.start_date}T00:00:00Z`).getTime() + q.nights * 86400000).toISOString().slice(0, 10) : null
  const groups = Object.entries(items.reduce<Record<string, string[]>>((g, it) => ((g[it.kind] ??= []).push(it.description), g), {}))
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <CompanyBlock c={c} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.title}>QUOTATION</Text>
          <Text>No. <Text style={s.bold}>{q.quote_no}</Text> · {dateIN(q.quote_date)}</Text>
          {q.valid_until && <Text>Valid until {dateIN(q.valid_until)}</Text>}
        </View>
      </View>

      <Text style={s.label}>Prepared for</Text>
      <Text style={[s.bold, { fontSize: 11, lineHeight: 1.4 }]}>{q.client_name}</Text>
      <Text style={{ fontSize: 15, lineHeight: 1.3, fontWeight: 700, marginTop: 8, marginBottom: 2 }}>{q.ptitle?.name || q.routes?.name || 'Holiday package'}</Text>
      <Text style={s.muted}>
        {[q.routes?.name, q.nights !== null && `${q.nights} nights / ${q.nights + 1} days`, q.start_date && `${dateIN(q.start_date)}${end ? ` – ${dateIN(end)}` : ''}`,
          `${q.adults} adult(s)${q.children ? `, ${q.children} child(ren)` : ''}${q.infants ? `, ${q.infants} infant(s)` : ''}`, q.meal?.name].filter(Boolean).join(' · ')}
      </Text>

      {days.length > 0 && (
        <>
          <H>Itinerary</H>
          {days.map((x) => (
            <View key={x.day_no} style={[s.row, { marginBottom: 6 }]} wrap={false}>
              <Text style={[s.bold, { width: 48 }]}>Day {x.day_no}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.bold}>{x.title}{x.cities?.name ? <Text style={[s.muted, { fontWeight: 400 }]}> · {x.cities.name}</Text> : null}</Text>
                {x.description && <Text style={s.muted}>{x.description}</Text>}
              </View>
            </View>
          ))}
        </>
      )}

      <H>What&apos;s included</H>
      {groups.map(([kind, descs]) => (
        <View key={kind} style={{ marginBottom: 4 }} wrap={false}>
          <Text style={s.bold}>{KIND[kind] ?? kind}</Text>
          {descs.map((x, i) => <Text key={i}>•  {x}</Text>)}
        </View>
      ))}
      {q.inclusions && <Text>{q.inclusions}</Text>}

      <View style={{ alignSelf: 'flex-end', width: 220, marginTop: 14 }} wrap={false}>
        <KV k="Package price" v={formatINR(q.subtotal)} />
        {Number(q.tax_total) > 0 && <KV k={`GST @ ${Number(q.gst_rate)}%`} v={formatINR(q.tax_total)} />}
        <KV k="Total" v={formatINR(q.grand_total)} strong top />
        {pax > 0 && <KV k="Per person" v={formatINR(Math.round(Number(q.grand_total) / pax))} />}
      </View>

      {q.exclusions && <><H>Not included</H><Text>{q.exclusions}</Text></>}
      {q.terms && <><H>Terms & policies</H><Text style={[s.muted, { fontSize: 7.5 }]}>{q.terms}</Text></>}
      <PageFooter left={`${q.quote_no} · ${c.legal_name || c.name}`} />
    </Page>
  )
}
