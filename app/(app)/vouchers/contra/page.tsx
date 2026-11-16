import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { VoucherList } from '@/components/voucher-list'

export const metadata = { title: 'Contra' }

export default async function Page({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams
  const { fy } = await getContext()
  return (
    <>
      <PageHeader title="Contra" description={`Moving money between cash and bank accounts · FY ${fy.label}`} actions={<LinkButton href="/vouchers/contra/new">New contra</LinkButton>} />
      <VoucherList kind="contra" saved={saved} />
    </>
  )
}
