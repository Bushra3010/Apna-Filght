import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { ItineraryForm } from '../itinerary-form'
import { getItineraryOptions } from '../data'

export const metadata = { title: 'Itinerary' }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params
  const { saved } = await searchParams
  const { supabase, org } = await getContext()
  const [{ data: it }, { data: days }] = await Promise.all([
    supabase.from('itineraries').select('*').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('itinerary_days').select('day_no, city_id, title, description').eq('itinerary_id', id).order('day_no'),
  ])
  if (!it) notFound()
  return (
    <>
      <PageHeader title={it.title} description={`${it.nights} nights / ${it.nights + 1} days`} actions={<LinkButton href={`/crm/quotations/new?itinerary=${it.id}`}>Quote this</LinkButton>} />
      {saved && <p className="mb-4 rounded-lg bg-primary/10 px-3 py-2 text-sm">Itinerary saved.</p>}
      <ItineraryForm
        draft={{
          id: it.id, title: it.title, route_id: it.route_id ?? '', package_title_id: it.package_title_id ?? '', nights: String(it.nights), overview: it.overview ?? '',
          days: (days ?? []).map((d) => ({ city_id: d.city_id ?? '', title: d.title, description: d.description ?? '' })),
        }}
        {...await getItineraryOptions()}
      />
    </>
  )
}
