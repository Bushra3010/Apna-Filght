import { getContext } from '@/lib/context'
import { InvoicePage, loadInvoices } from '@/lib/pdf/invoice'
import { fileSafe } from '@/lib/pdf/kit'
import { pdfResponse } from '@/lib/pdf/render'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [d] = await loadInvoices(supabase, org.id, [id])
  if (!d) return new Response('Not found', { status: 404 })
  const download = new URL(req.url).searchParams.has('download')
  return pdfResponse([<InvoicePage key={id} d={d} />], d.inv.invoice_no, `${fileSafe(d.inv.invoice_no)}.pdf`, download)
}
