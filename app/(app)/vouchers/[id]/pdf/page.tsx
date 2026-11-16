import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { loadVoucher } from '@/lib/pdf/data'
import { fileSafe } from '@/lib/pdf/kit-names'
import { PdfView } from '@/components/pdf-view-lazy'
import { PageHeader } from '@/components/page-header'

export const metadata = { title: 'Voucher PDF' }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ download?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const { supabase, org } = await getContext()
  const d = await loadVoucher(supabase, org.id, id)
  if (!d) notFound()
  return (
    <>
      <PageHeader title={`${d.v.voucher_no} · PDF`} />
      <PdfView doc={{ kind: 'voucher', doc: d }} title={d.v.voucher_no} filename={`${fileSafe(d.v.voucher_no)}.pdf`} download={'download' in sp} />
    </>
  )
}
