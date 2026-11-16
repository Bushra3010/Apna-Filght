import { getContext } from '@/lib/context'
import { todayIST } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BatchForm } from './batch-form'

export const metadata = { title: 'Batch entry' }

export default async function BatchPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: k } = await searchParams
  const kind = k === 'payment' ? 'payment' : 'receipt'
  const { supabase, org } = await getContext()
  const { data: ledgers } = await supabase.from('ledgers').select('id, name, kind').eq('org_id', org.id).eq('is_active', true).order('name')
  const accounts = (ledgers ?? []).filter((l) => l.kind === 'bank' || l.kind === 'cash').sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'bank' ? -1 : 1))
  const parties = (ledgers ?? []).filter((l) => (kind === 'receipt' ? ['customer', 'other'] : ['supplier', 'customer', 'expense', 'other', 'tax', 'capital']).includes(l.kind))
  return (
    <>
      <PageHeader title={kind === 'receipt' ? 'Batch receipts' : 'Batch payments'} description={kind === 'receipt' ? 'Several clients’ money into one account, entered in one go' : 'Several payments from one account, entered in one go'} />
      <BatchForm kind={kind} parties={parties} accounts={accounts} today={todayIST()} />
    </>
  )
}
