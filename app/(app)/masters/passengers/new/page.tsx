import { PageHeader } from '@/components/page-header'
import { getParties } from '../../../crm/leads/data'
import { PassengerForm } from '../passenger-form'

export const metadata = { title: 'New passenger' }

export default async function Page() {
  return (
    <>
      <PageHeader title="New passenger" />
      <PassengerForm p={{}} parties={await getParties()} />
    </>
  )
}
