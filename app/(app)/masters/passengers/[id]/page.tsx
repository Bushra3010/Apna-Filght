import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { getParties } from '../../../crm/leads/data'
import { PassengerForm, type PassengerRow } from '../passenger-form'

export const metadata = { title: 'Edit passenger' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const { data } = await supabase.from('passengers').select('id, title, first_name, last_name, dob, gender, mobile, email, party_ledger_id, passport_no, passport_expiry, address, remark').eq('org_id', org.id).eq('id', id).maybeSingle()
  if (!data) notFound()
  return (
    <>
      <PageHeader title={`${data.first_name} ${data.last_name ?? ''}`.trim()} />
      <PassengerForm p={data as PassengerRow} parties={await getParties()} />
    </>
  )
}
