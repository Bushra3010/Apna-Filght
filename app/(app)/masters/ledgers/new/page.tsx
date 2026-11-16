import { PageHeader } from '@/components/page-header'
import { LedgerForm } from '../ledger-form'
import { getStates } from '../data'

export const metadata = { title: 'New ledger' }

export default async function NewLedgerPage({ searchParams }: { searchParams: Promise<{ kind?: string; return_to?: string }> }) {
  const { kind, return_to } = await searchParams
  return (
    <>
      <PageHeader title="New ledger" />
      <LedgerForm ledger={{ kind: kind ?? 'customer' }} states={await getStates()} returnTo={return_to} />
    </>
  )
}
