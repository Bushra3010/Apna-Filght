import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { formatAmount, formatINR } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Tile, Panel } from '@/components/tile'

export const metadata = { title: 'Group purchase' }

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: g }, { data: seats }] = await Promise.all([
    supabase.from('v_group_purchase').select('*').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('invoice_lines').select('id, pax_name, net_sale, cgst, sgst, igst, invoices!inner(id, invoice_no, invoice_date, doc_kind, status, party:ledgers!invoices_party_ledger_id_fkey(name))').eq('group_purchase_id', id).eq('invoices.status', 'posted').order('created_at'),
  ])
  if (!g) notFound()
  const perSeat = g.seats ? Math.round(Number(g.taxable) / g.seats) : 0
  return (
    <>
      <PageHeader title={g.bill_no} description={[g.sector, g.pnr, g.flight_no, g.travel_date && new Date(g.travel_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })].filter(Boolean).join(' · ')}
        actions={<LinkButton href={`/billing/invoices/new?group=${g.id}`}>Sell seats</LinkButton>} />
      <div className="grid gap-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile tone="blue" tag="Seats" title="Sold" sub={`of ${g.seats}`} value={String(g.sold)} href={`/purchase/groups/${g.id}`} />
          <Tile tone="cyan" tag="Seats" title="Left" sub="Still to sell" value={String(g.left_seats)} href={`/billing/invoices/new?group=${g.id}`} />
          <Tile tone="orange" tag="Cost" title="Per seat" sub={`Total ${formatINR(g.taxable).replace(/\.00$/, '')}`} value={formatINR(perSeat).replace(/\.00$/, '')} href={`/purchase/general/${g.id}`} />
          <Tile tone={Number(g.profit) < 0 ? 'red' : 'green'} tag="Result" title="Profit so far" sub={`Sales ${formatINR(g.revenue).replace(/\.00$/, '')}`} value={formatINR(g.profit).replace(/\.00$/, '')} href="/purchase/groups" />
        </div>
        <Panel title="Seats sold" count={seats?.length ?? 0}>
          {seats?.length ? (
            <ul className="grid gap-2 text-sm">
              {seats.map((s) => {
                const inv = s.invoices as unknown as { id: string; invoice_no: string; invoice_date: string; doc_kind: string; party: { name: string } }
                return (
                  <li key={s.id}>
                    <Link href={`/billing/invoices/${inv.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3 hover:bg-muted">
                      <span><span className="font-semibold">{s.pax_name}</span> <span className="text-muted-foreground">· {inv.invoice_no} · {inv.party.name}{inv.doc_kind === 'credit_note' && ' · cancelled'}</span></span>
                      <span className="font-semibold tabular-nums">{formatAmount(s.net_sale - s.cgst - s.sgst - s.igst)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No seats sold yet.</p>
          )}
        </Panel>
      </div>
    </>
  )
}
