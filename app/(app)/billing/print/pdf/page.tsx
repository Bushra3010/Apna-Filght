import { getContext } from '@/lib/context'
import { loadInvoices } from '@/lib/pdf/data'
import { PdfView } from '@/components/pdf-view-lazy'
import { PageHeader, EmptyState } from '@/components/page-header'

export const metadata = { title: 'Bulk print' }

const MAX = 150
const KINDS: Record<string, string> = { invoice: 'Invoices', credit_note: 'Credit notes', proforma: 'Proforma invoices' }
const UUID = /^[0-9a-f-]{36}$/i

/** Many invoices in one PDF: ?from=&to=&kind=&party= */
export default async function BulkPdfPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const { supabase, org, fy } = await getContext()
  const iso = (v: string | undefined, d: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d)
  const from = iso(sp.from, fy.starts_on)
  const to = iso(sp.to, fy.ends_on)
  const kind = sp.kind && KINDS[sp.kind] ? sp.kind : 'invoice'
  let q = supabase.from('invoices').select('id').eq('org_id', org.id).eq('doc_kind', kind).neq('status', kind === 'proforma' ? 'cancelled' : 'draft')
    .gte('invoice_date', from).lte('invoice_date', to).order('invoice_date').order('invoice_no').limit(MAX + 1)
  if (sp.party && UUID.test(sp.party)) q = q.eq('party_ledger_id', sp.party)
  const { data } = await q
  const tooMany = (data?.length ?? 0) > MAX
  const docs = tooMany ? [] : await loadInvoices(supabase, org.id, (data ?? []).map((r) => r.id))
  return (
    <>
      <PageHeader title={`${KINDS[kind]} · ${from} to ${to}`} description={tooMany ? undefined : `${docs.length} document(s)`} />
      {tooMany ? <EmptyState>More than {MAX} documents: choose a shorter date range.</EmptyState>
        : !docs.length ? <EmptyState>No documents match these filters.</EmptyState>
          : <PdfView doc={{ kind: 'invoices', docs }} title={`${KINDS[kind]} ${from} to ${to}`} filename={`${kind}s-${from}-to-${to}.pdf`} download={'download' in sp} />}
    </>
  )
}
