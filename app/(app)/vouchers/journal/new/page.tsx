import { PageHeader } from '@/components/page-header'
import { getAllLedgers, today } from '../../data'
import { JournalForm } from '../../voucher-forms'

export const metadata = { title: 'New journal' }

export default async function NewJournalPage() {
  return (
    <>
      <PageHeader title="New journal" description="Debits must equal credits" />
      <JournalForm ledgers={await getAllLedgers()} today={today()} />
    </>
  )
}
