import { getContext } from '@/lib/context'
import { QuotationPage, loadQuotation } from '@/lib/pdf/quotation'
import { fileSafe } from '@/lib/pdf/kit'
import { pdfResponse } from '@/lib/pdf/render'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const d = await loadQuotation(supabase, org.id, id)
  if (!d) return new Response('Not found', { status: 404 })
  const download = new URL(req.url).searchParams.has('download')
  return pdfResponse([<QuotationPage key={id} d={d} />], d.q.quote_no, `${fileSafe(d.q.quote_no)}.pdf`, download)
}
