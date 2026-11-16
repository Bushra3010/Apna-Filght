import { PageHeader } from '@/components/page-header'
import { getAllLedgers, today } from '../../data'
import { ContraForm } from '../../voucher-forms'

export const metadata = { title: 'New contra' }

export default async function NewContraPage() {
  return (
    <>
      <PageHeader title="New contra" description="Cash deposited, cash withdrawn, or a transfer between your bank accounts" />
      <ContraForm ledgers={await getAllLedgers()} today={today()} />
    </>
  )
}
