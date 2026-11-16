import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { loadInvoices } from '@/lib/pdf/data'
import { fileSafe } from '@/lib/pdf/kit-names'
import { PdfView } from '@/components/pdf-view-lazy'
import { PageHeader } from '@/components/page-header'

export const metadata = { title: 'Invoice PDF' }

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ download?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const { supabase, org } = await getContext()
  const [d] = await loadInvoices(supabase, org.id, [id])
  if (!d) notFound()
  return (
    <>
      <PageHeader title={`${d.inv.invoice_no} · PDF`} />
      <PdfView doc={{ kind: 'invoices', docs: [d] }} title={d.inv.invoice_no} filename={`${fileSafe(d.inv.invoice_no)}.pdf`} download={'download' in sp} />
    </>
  )
}
