import { PageHeader } from '@/components/page-header'
import { LeadForm } from '../lead-form'
import { getMembers, getParties } from '../data'
import { todayIST } from '@/lib/dates'

export const metadata = { title: 'New lead' }

export default async function NewLeadPage() {
  // Suggest calling back tomorrow (India date); the user can change it.
  const tomorrow = new Date(`${todayIST()}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return (
    <>
      <PageHeader title="New lead" description="Only name and phone are needed. Add the rest when you know it." />
      <LeadForm lead={{ status: 'initial' }} parties={await getParties()} members={await getMembers()} followupDate={tomorrow.toISOString().slice(0, 10)} />
    </>
  )
}
