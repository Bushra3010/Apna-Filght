import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { formatAmount, formatINR } from '@/lib/money'
import { amountInWords } from '@/lib/words'
import { LinkButton } from '@/components/link-button'
import { PrintButton } from '@/components/print-button'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Invoice' }

type Party = { name: string; gstin: string | null; address: string | null; mobile: string | null; email: string | null; states: { name: string; gst_code: string } | null }

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: inv }, { data: lines }, { data: company }, { data: bal }] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, party:ledgers!invoices_party_ledger_id_fkey(name, gstin, address, mobile, email, states(name, gst_code)), pos:states!invoices_place_of_supply_state_id_fkey(name, gst_code)')
      .eq('org_id', org.id)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('invoice_lines').select('*, airlines(code)').eq('invoice_id', id).order('sort'),
    supabase.from('orgs').select('name, legal_name, address_line1, address_line2, pincode, phone, mobile, email, gstin, pan, invoice_terms, states(name, gst_code)').eq('id', org.id).single(),
    supabase.from('v_invoice_balance').select('allocated, balance, pay_status').eq('id', id).maybeSingle(),
  ])
  if (!inv) notFound()
  const party = inv.party as unknown as Party
  const pos = inv.pos as unknown as { name: string; gst_code: string } | null
  const cs = company?.states as unknown as { name: string; gst_code: string } | null
  const inter = inv.is_interstate as boolean

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{inv.invoice_no}</h1>
          <Badge variant={inv.status === 'posted' ? 'secondary' : 'outline'}>{inv.status}</Badge>
          {bal && <Badge variant={bal.pay_status === 'paid' ? 'default' : 'outline'}>{bal.pay_status}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <LinkButton href={`/billing/invoices/${inv.id}/edit`} variant="outline">Edit</LinkButton>
          {bal && Number(bal.balance) > 0 && (
            <LinkButton href={`/vouchers/receipts/new?party=${inv.party_ledger_id}&invoice=${inv.id}`}>
              Receive {formatINR(bal.balance)}
            </LinkButton>
          )}
        </div>
      </div>

      <article className="mx-auto max-w-4xl rounded-xl border bg-white p-8 text-sm text-neutral-900 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-6 border-b pb-4">
          <div>
            <p className="text-lg font-semibold">{company?.legal_name || company?.name}</p>
            <p>{[company?.address_line1, company?.address_line2].filter(Boolean).join(', ')}</p>
            <p>{[cs?.name, company?.pincode].filter(Boolean).join(' – ')}</p>
            <p>{[company?.mobile, company?.email].filter(Boolean).join(' · ')}</p>
            {company?.gstin && <p>GSTIN: <span className="font-mono">{company.gstin}</span></p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-wide">TAX INVOICE</p>
            <p>No. <span className="font-medium">{inv.invoice_no}</span></p>
            <p>Date {new Date(inv.invoice_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
            {inv.due_date && <p>Due {new Date(inv.due_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>}
          </div>
        </header>

        <section className="grid gap-4 border-b py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-neutral-500 uppercase">Bill to</p>
            <p className="font-medium">{party.name}</p>
            {party.address && <p>{party.address}</p>}
            {party.gstin && <p>GSTIN: <span className="font-mono">{party.gstin}</span></p>}
            {(inv.contact_phone || party.mobile) && <p>{inv.contact_phone || party.mobile}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-neutral-500 uppercase">Place of supply</p>
            <p>{pos ? `${pos.gst_code} – ${pos.name}` : '—'}</p>
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Passenger / travel</th>
                <th className="py-2 pr-2 text-right">Base fare</th>
                <th className="py-2 pr-2 text-right">Taxes</th>
                <th className="py-2 pr-2 text-right">Fee + charges</th>
                <th className="py-2 pr-2 text-right">{inter ? 'IGST' : 'CGST + SGST'}</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines?.map((l, i) => (
                <tr key={l.id} className="border-b align-top">
                  <td className="py-2 pr-2">{i + 1}</td>
                  <td className="py-2 pr-2">
                    <p className="font-medium">{l.pax_name} {l.pax_type && l.pax_type !== 'adult' && <span className="text-neutral-500">({l.pax_type})</span>}</p>
                    <p className="text-neutral-600">
                      {[(l.airlines as unknown as { code: string } | null)?.code && `${(l.airlines as unknown as { code: string }).code} ${l.flight_no ?? ''}`.trim(), l.sector,
                        l.travel_date && new Date(l.travel_date).toLocaleDateString('en-IN'), l.pnr && `PNR ${l.pnr}`, l.ticket_no && `Tkt ${l.ticket_no}`]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatAmount(l.basic)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatAmount(l.xt)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatAmount(l.service_fee + l.other_charges - l.discount)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {formatAmount(l.cgst + l.sgst + l.igst)}
                    <span className="block text-neutral-500">@{Number(l.gst_rate)}%</span>
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">{formatAmount(l.net_sale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="grid gap-6 py-4 sm:grid-cols-[1fr_260px]">
          <div>
            <p className="text-xs text-neutral-500 uppercase">Amount in words</p>
            <p className="font-medium">{amountInWords(inv.total)}</p>
            {inv.notes && <p className="mt-3 whitespace-pre-line">{inv.notes}</p>}
          </div>
          <dl className="grid gap-1">
            <div className="flex justify-between"><dt>Taxable value</dt><dd className="tabular-nums">{formatAmount(inv.taxable)}</dd></div>
            {inter ? (
              <div className="flex justify-between"><dt>IGST</dt><dd className="tabular-nums">{formatAmount(inv.igst)}</dd></div>
            ) : (
              <>
                <div className="flex justify-between"><dt>CGST</dt><dd className="tabular-nums">{formatAmount(inv.cgst)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd className="tabular-nums">{formatAmount(inv.sgst)}</dd></div>
              </>
            )}
            <div className="mt-1 flex justify-between border-t pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatINR(inv.total)}</dd></div>
            {bal && Number(bal.allocated) > 0 && (
              <>
                <div className="flex justify-between text-neutral-600"><dt>Received</dt><dd className="tabular-nums">{formatAmount(bal.allocated)}</dd></div>
                <div className="flex justify-between font-medium"><dt>Balance due</dt><dd className="tabular-nums">{formatINR(bal.balance)}</dd></div>
              </>
            )}
          </dl>
        </section>

        {company?.invoice_terms && (
          <footer className="border-t pt-4 text-xs whitespace-pre-line text-neutral-600">{company.invoice_terms}</footer>
        )}
        <p className="mt-10 text-right text-xs text-neutral-500">For {company?.legal_name || company?.name} — Authorised signatory</p>
      </article>
    </>
  )
}
