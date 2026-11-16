import { getContext } from '@/lib/context'
import { InvoicePage, loadInvoices } from '@/lib/pdf/invoice'
import { pdfResponse } from '@/lib/pdf/render'

const MAX = 150
const KINDS = ['invoice', 'credit_note', 'proforma']

/** Many invoices in one PDF: ?from=&to=&kind=&party= (or ?ids=a,b,c). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const { supabase, org, fy } = await getContext()
  let ids = (sp.get('ids') ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX)
  const iso = (v: string | null, d: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d)
  const from = iso(sp.get('from'), fy.starts_on)
  const to = iso(sp.get('to'), fy.ends_on)
  if (!ids.length) {
    const kind = KINDS.includes(sp.get('kind') ?? '') ? sp.get('kind')! : 'invoice'
    let q = supabase.from('invoices').select('id').eq('org_id', org.id).eq('doc_kind', kind).neq('status', kind === 'proforma' ? 'cancelled' : 'draft')
      .gte('invoice_date', from).lte('invoice_date', to).order('invoice_date').order('invoice_no').limit(MAX + 1)
    const party = sp.get('party')
    if (party && /^[0-9a-f-]{36}$/i.test(party)) q = q.eq('party_ledger_id', party)
    const { data } = await q
    if ((data?.length ?? 0) > MAX) return new Response(`More than ${MAX} documents: choose a shorter date range.`, { status: 400 })
    ids = (data ?? []).map((r) => r.id)
  }
  const docs = await loadInvoices(supabase, org.id, ids)
  if (!docs.length) return new Response('No documents match these filters.', { status: 404 })
  return pdfResponse(docs.map((d) => <InvoicePage key={d.inv.id} d={d} />), `Invoices ${from} to ${to}`, `invoices-${from}-to-${to}.pdf`, sp.has('download'))
}
