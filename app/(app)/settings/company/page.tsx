import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { getStates } from '../../masters/ledgers/data'
import { CompanySettingsForm } from './company-form'

export const metadata = { title: 'Company settings' }

export default async function CompanySettingsPage() {
  const { supabase, org } = await getContext()
  const { data } = await supabase
    .from('orgs')
    .select('name, legal_name, address_line1, address_line2, state_id, pincode, phone, mobile, email, gstin, pan, invoice_terms')
    .eq('id', org.id)
    .single()
  return (
    <>
      <PageHeader title="Company" description="Shown on invoices and receipts" />
      <CompanySettingsForm org={(data ?? {}) as Record<string, string | null>} states={await getStates()} />
    </>
  )
}
