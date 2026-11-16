import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { formatAmount, formatINR } from '@/lib/money'
import { amountInWords } from '@/lib/words'
import { describeLine } from '@/lib/invoice'
import { LinkButton } from '@/components/link-button'
import { PrintButton } from '@/components/print-button'
import { WhatsAppButton } from '@/components/whatsapp-button'
import { fillTemplate, templateFor } from '@/lib/messages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { convertProforma } from '../actions'

export const metadata = { title: 'Invoice' }

type Party = { name: string; gstin: string | null; address: string | null; mobile: string | null }
type Bal = { allocated: number; balance: number; credited: number; pay_status: string }

const STATUS_LABEL: Record<string, string> = { refund_due: 'refund due', paid: 'paid', partial: 'partial', unpaid: 'unpaid', cancelled: 'cancelled' }

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const { error: actionError } = await searchParams
  const { supabase, org } = await getContext()
  const [{ data: inv }, { data: lines }, { data: company }, { data: bal }, { data: credits }] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, party:ledgers!invoices_party_ledger_id_fkey(name, gstin, address, mobile), pos:states!invoices_place_of_supply_state_id_fkey(name, gst_code), ref:ref_invoice_id(id, invoice_no, invoice_date), conv:converted_to_invoice_id(id, invoice_no), quote:quotation_id(id, quote_no), booked:lookups!invoices_booked_by_id_fkey(name)')
      .eq('org_id', org.id)
      .eq('id', id)
      .maybeSingle(),
    supabase.from('invoice_lines').select('*, airlines(code)').eq('invoice_id', id).order('sort'),
    supabase.from('orgs').select('name, legal_name, address_line1, address_line2, pincode, phone, mobile, email, gstin, pan, invoice_terms, states(name, gst_code)').eq('id', org.id).single(),
    supabase.from('v_invoice_balance').select('allocated, balance, credited, pay_status').eq('id', id).maybeSingle(),
    supabase.from('invoices').select('id, invoice_no, invoice_date, total').eq('ref_invoice_id', id).eq('doc_kind', 'credit_note').order('invoice_date'),
  ])
  if (!inv) notFound()
  const { data: tpl } = await supabase.from('message_templates').select('doc_type, body').eq('org_id', org.id).eq('channel', 'whatsapp')
  const b = bal as Bal | null
  const party = inv.party as unknown as Party
  const pos = inv.pos as unknown as { name: string; gst_code: string } | null
  const ref = inv.ref as unknown as { id: string; invoice_no: string; invoice_date: string } | null
  const booked = inv.booked as unknown as { name: string } | null
  const cs = company?.states as unknown as { name: string; gst_code: string } | null
  const inter = inv.is_interstate as boolean
  const isCN = inv.doc_kind === 'credit_note'
  const isPf = inv.doc_kind === 'proforma'
  const conv = inv.conv as unknown as { id: string; invoice_no: string } | null
  const quote = inv.quote as unknown as { id: string; quote_no: string } | null
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const noGst = inv.bill_type === 'bill_of_supply'
  const hasXt = lines?.some((l) => Number(l.xt) !== 0)
  const title = isCN ? 'CREDIT NOTE' : isPf ? 'PROFORMA INVOICE' : noGst ? 'BILL OF SUPPLY' : 'TAX INVOICE'
  const date = (d: string) => new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' })
  const trip = lines?.find((l) => l.sector || l.travel_date)
  const msgVars = {
    client: party.name, doc_no: inv.invoice_no, date: date(inv.invoice_date), amount: formatINR(inv.total),
    balance: formatINR(Math.max(0, Number(b?.balance ?? inv.total))), due_date: inv.due_date ? `, due ${date(inv.due_date)}` : '',
    travel: trip ? [[trip.sector, trip.travel_date && `on ${date(trip.travel_date)}`].filter(Boolean).join(' '), trip.pnr && `PNR ${trip.pnr}`].filter(Boolean).join(', ') : '',
    company: company?.legal_name || company?.name || '',
  }
  const phone = inv.contact_phone || party.mobile

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{inv.invoice_no}</h1>
          <Badge variant="secondary">{isCN ? 'credit note' : isPf ? (conv ? 'proforma · invoiced' : 'proforma') : inv.status}</Badge>
          {conv && <Link href={`/billing/invoices/${conv.id}`} className="text-sm text-muted-foreground underline">→ {conv.invoice_no}</Link>}
          {quote && <Link href={`/crm/quotations/${quote.id}`} className="text-sm text-muted-foreground underline">{quote.quote_no}</Link>}
          {b && <Badge variant={b.pay_status === 'paid' ? 'default' : b.pay_status === 'refund_due' ? 'destructive' : 'outline'}>{STATUS_LABEL[b.pay_status] ?? b.pay_status}</Badge>}
          {ref && (
            <span className="text-sm text-muted-foreground">
              against <Link href={`/billing/invoices/${ref.id}`} className="underline">{ref.invoice_no}</Link>
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <LinkButton href={`/billing/invoices/${inv.id}/pdf`} external variant="outline">PDF</LinkButton>
          {!isCN && <WhatsAppButton phone={phone} text={fillTemplate(templateFor(tpl, 'invoice'), msgVars)} />}
          {!isCN && !isPf && b && Number(b.balance) > 0 && <WhatsAppButton phone={phone} label="Remind" text={fillTemplate(templateFor(tpl, 'reminder'), msgVars)} />}
          {inv.bill_type === 'hotel' && !isCN && !isPf && <LinkButton href={`/billing/hotel-vouchers/new?invoice=${inv.id}`} variant="outline">Hotel voucher</LinkButton>}
          {!isCN && !conv && <LinkButton href={`/billing/invoices/${inv.id}/edit`} variant="outline">Edit</LinkButton>}
          {isPf && !conv && (
            <form action={convertProforma} className="flex gap-2">
              <input type="hidden" name="id" value={inv.id} />
              <Input type="date" name="date" defaultValue={today} aria-label="Invoice date" className="w-36" />
              <Button type="submit">Convert to invoice</Button>
            </form>
          )}
          {!isCN && !isPf && b && b.pay_status !== 'cancelled' && (
            <LinkButton href={`/billing/credit-notes/new?invoice=${inv.id}`} variant="outline">Cancel / refund</LinkButton>
          )}
          {b && Number(b.balance) > 0 && (
            <LinkButton href={`/vouchers/receipts/new?party=${inv.party_ledger_id}&invoice=${inv.id}`}>Receive {formatINR(b.balance)}</LinkButton>
          )}
          {b && Number(b.balance) < 0 && (
            <LinkButton href={`/vouchers/payments/new?party=${inv.party_ledger_id}&invoice=${inv.id}`}>Pay refund {formatINR(-Number(b.balance))}</LinkButton>
          )}
        </div>
      </div>

      {actionError && <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive print:hidden">{actionError}</p>}
      {credits && credits.length > 0 && (
        <p className="mb-4 text-sm text-muted-foreground print:hidden">
          Credit notes:{' '}
          {credits.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', '}
              <Link href={`/billing/invoices/${c.id}`} className="underline">{c.invoice_no}</Link> ({formatINR(c.total)})
            </span>
          ))}
        </p>
      )}

      <article className="mx-auto max-w-4xl rounded-3xl bg-white p-8 text-sm text-neutral-900 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-6 border-b pb-4">
          <div>
            <p className="text-lg font-semibold">{company?.legal_name || company?.name}</p>
            <p>{[company?.address_line1, company?.address_line2].filter(Boolean).join(', ')}</p>
            <p>{[cs?.name, company?.pincode].filter(Boolean).join(' – ')}</p>
            <p>{[company?.mobile, company?.email].filter(Boolean).join(' · ')}</p>
            {company?.gstin && <p>GSTIN: <span className="font-mono">{company.gstin}</span></p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-wide">{title}</p>
            <p>No. <span className="font-medium">{inv.invoice_no}</span></p>
            <p>Date {date(inv.invoice_date)}</p>
            {ref && <p>Against invoice {ref.invoice_no} dated {date(ref.invoice_date)}</p>}
            {inv.due_date && <p>Due {date(inv.due_date)}</p>}
            {booked && <p className="text-neutral-500">Booked by {booked.name}</p>}
          </div>
        </header>

        <section className="grid gap-4 border-b py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-neutral-500 uppercase">{isCN ? 'Issued to' : 'Bill to'}</p>
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
                <th className="py-2 pr-2">Particulars</th>
                <th className="py-2 pr-2 text-right">Basic</th>
                {hasXt && <th className="py-2 pr-2 text-right">Taxes</th>}
                <th className="py-2 pr-2 text-right">Fee + charges</th>
                {!noGst && <th className="py-2 pr-2 text-right">{inter ? 'IGST' : 'CGST + SGST'}</th>}
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines?.map((l, i) => (
                <tr key={l.id} className="border-b align-top">
                  <td className="py-2 pr-2">{i + 1}</td>
                  <td className="py-2 pr-2">
                    <p className="font-medium">
                      {l.service === 'cancellation_charge' ? 'Cancellation charges' : l.pax_name || l.description}
                      {l.pax_type && l.pax_type !== 'adult' && <span className="text-neutral-500"> ({l.pax_type})</span>}
                    </p>
                    {l.service !== 'cancellation_charge' && (
                      <p className="text-neutral-600">
                        {describeLine({ ...l, airline_code: (l.airlines as unknown as { code: string } | null)?.code, description: l.pax_name ? l.description : null })}
                      </p>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatAmount(l.basic)}</td>
                  {hasXt && <td className="py-2 pr-2 text-right tabular-nums">{formatAmount(l.xt)}</td>}
                  <td className="py-2 pr-2 text-right tabular-nums">{formatAmount(l.service_fee + l.other_charges - l.discount)}</td>
                  {!noGst && (
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {formatAmount(l.cgst + l.sgst + l.igst)}
                      <span className="block text-neutral-500">@{Number(l.gst_rate)}%</span>
                    </td>
                  )}
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
            {!noGst && <div className="flex justify-between"><dt>Taxable value</dt><dd className="tabular-nums">{formatAmount(inv.taxable)}</dd></div>}
            {!noGst && (inter ? (
              <div className="flex justify-between"><dt>IGST</dt><dd className="tabular-nums">{formatAmount(inv.igst)}</dd></div>
            ) : (
              <>
                <div className="flex justify-between"><dt>CGST</dt><dd className="tabular-nums">{formatAmount(inv.cgst)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd className="tabular-nums">{formatAmount(inv.sgst)}</dd></div>
              </>
            ))}
            <div className="mt-1 flex justify-between border-t pt-1 text-base font-semibold">
              <dt>{isCN ? 'Refund' : 'Total'}</dt>
              <dd className="tabular-nums">{formatINR(inv.total)}</dd>
            </div>
            {b && Number(b.credited) > 0 && (
              <div className="flex justify-between text-neutral-600"><dt>Credit notes</dt><dd className="tabular-nums">{formatAmount(b.credited)}</dd></div>
            )}
            {b && Number(b.allocated) - Number(b.credited) !== 0 && (
              <div className="flex justify-between text-neutral-600"><dt>Received (net)</dt><dd className="tabular-nums">{formatAmount(Number(b.allocated) - Number(b.credited))}</dd></div>
            )}
            {b && Number(b.allocated) > 0 && (
              <div className="flex justify-between font-medium">
                <dt>{Number(b.balance) < 0 ? 'Refund due' : 'Balance due'}</dt>
                <dd className="tabular-nums">{formatINR(Math.abs(Number(b.balance)))}</dd>
              </div>
            )}
          </dl>
        </section>

        {company?.invoice_terms && !isCN && (
          <footer className="border-t pt-4 text-xs whitespace-pre-line text-neutral-600">{company.invoice_terms}</footer>
        )}
        <p className="mt-10 text-right text-xs text-neutral-500">For {company?.legal_name || company?.name} — Authorised signatory</p>
      </article>
    </>
  )
}
