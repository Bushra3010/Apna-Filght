import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { VoucherList } from '@/components/voucher-list'

export const metadata = { title: 'Payments' }

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams
  const { fy } = await getContext()
  return (
    <>
      <PageHeader title="Payments" description={`Money paid to suppliers, for expenses, or refunds to clients · FY ${fy.label}`} actions={<><LinkButton href="/vouchers/import?kind=payment" variant="outline">Import</LinkButton><LinkButton href="/vouchers/batch?kind=payment" variant="outline">Batch entry</LinkButton><LinkButton href="/vouchers/payments/new">New payment</LinkButton></>} />
      <VoucherList kind="payment" saved={saved} />
    </>
  )
}
