import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { VoucherList } from '@/components/voucher-list'

export const metadata = { title: 'Journal' }

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams
  const { fy } = await getContext()
  return (
    <>
      <PageHeader title="Journal" description={`Adjustments between any accounts · FY ${fy.label}`} actions={<LinkButton href="/vouchers/journal/new">New journal</LinkButton>} />
      <VoucherList kind="journal" saved={saved} />
    </>
  )
}
