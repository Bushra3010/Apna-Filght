import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { LedgerForm, type LedgerRow } from '../ledger-form'
import { getStates } from '../data'

export const metadata = { title: 'Edit ledger' }

export default async function EditLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const { data } = await supabase
    .from('ledgers')
    .select('id, name, kind, gstin, pan, state_id, address, contact_person, phone, mobile, email, credit_days, system_key')
    .eq('org_id', org.id)
    .eq('id', id)
    .maybeSingle()
  if (!data || data.system_key) notFound()
  return (
    <>
      <PageHeader title={`Edit ${data.name}`} />
      <LedgerForm ledger={data as LedgerRow} states={await getStates()} />
    </>
  )
}
