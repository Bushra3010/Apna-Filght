import { PageHeader } from '@/components/page-header'
import { getCities, getSuppliers } from '../../data'
import { HotelForm } from '../hotel-form'

export const metadata = { title: 'New hotel' }

export default async function Page() {
  const [cities, suppliers] = await Promise.all([getCities(), getSuppliers()])
  return (
    <>
      <PageHeader title="New hotel" description="Add the hotel, then its room rates" />
      <HotelForm h={{}} cities={cities} suppliers={suppliers} />
    </>
  )
}
