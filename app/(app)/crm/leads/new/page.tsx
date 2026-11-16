import { PageHeader } from '@/components/page-header'
import { LeadForm } from '../lead-form'
import { getMembers, getParties } from '../data'

export const metadata = { title: 'New lead' }

export default async function NewLeadPage() {
  return (
    <>
      <PageHeader title="New lead" description="Capture a travel enquiry and schedule the first follow-up." />
      <LeadForm lead={{ status: 'initial' }} parties={await getParties()} members={await getMembers()} />
    </>
  )
}
