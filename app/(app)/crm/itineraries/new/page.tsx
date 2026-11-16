import { PageHeader } from '@/components/page-header'
import { ItineraryForm } from '../itinerary-form'
import { getItineraryOptions } from '../data'

export const metadata = { title: 'New itinerary' }

export default async function Page() {
  const blank = { city_id: '', title: '', description: '' }
  return (
    <>
      <PageHeader title="New itinerary" description="A reusable day-wise plan you can attach to quotations" />
      <ItineraryForm draft={{ title: '', route_id: '', package_title_id: '', nights: '2', overview: '', days: [blank, blank, blank] }} {...await getItineraryOptions()} />
    </>
  )
}
