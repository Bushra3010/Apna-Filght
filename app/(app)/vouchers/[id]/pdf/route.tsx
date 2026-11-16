import { getContext } from '@/lib/context'
import { VoucherPage, loadVoucher } from '@/lib/pdf/voucher'
import { fileSafe } from '@/lib/pdf/kit'
import { pdfResponse } from '@/lib/pdf/render'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const d = await loadVoucher(supabase, org.id, id)
  if (!d) return new Response('Not found', { status: 404 })
  const download = new URL(req.url).searchParams.has('download')
  return pdfResponse([<VoucherPage key={id} d={d} />], d.v.voucher_no, `${fileSafe(d.v.voucher_no)}.pdf`, download)
}
