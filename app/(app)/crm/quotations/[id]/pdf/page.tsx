import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { loadQuotation } from '@/lib/pdf/data'
import { fileSafe } from '@/lib/pdf/kit-names'
import { PdfView } from '@/components/pdf-view-lazy'
import { PageHeader } from '@/components/page-header'

export const metadata = { title: 'Quotation PDF' }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ download?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const { supabase, org } = await getContext()
  const d = await loadQuotation(supabase, org.id, id)
  if (!d) notFound()
  return (
    <>
      <PageHeader title={`${d.q.quote_no} · PDF`} />
      <PdfView doc={{ kind: 'quotation', doc: d }} title={d.q.quote_no} filename={`${fileSafe(d.q.quote_no)}.pdf`} download={'download' in sp} />
    </>
  )
}
