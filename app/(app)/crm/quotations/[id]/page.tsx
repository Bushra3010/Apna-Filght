import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { formatINR } from '@/lib/money'
import { QUOTE_STATUSES } from '@/lib/quotation'
import { label } from '@/lib/leads'
import { LinkButton } from '@/components/link-button'
import { PrintButton } from '@/components/print-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { setQuotationStatus } from '../actions'

export const metadata = { title: 'Quotation' }

const KIND: Record<string, string> = { hotel: 'Accommodation', activity: 'Sightseeing & activities', vehicle: 'Transport', flight: 'Flights', visa: 'Visa', insurance: 'Insurance', other: 'Other' }

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: q }, { data: items }, { data: company }, { data: proformas }] = await Promise.all([
    supabase.from('quotations').select('*, routes(name), ptitle:lookups!quotations_package_title_id_fkey(name), meal:lookups!quotations_meal_plan_id_fkey(name), leads(id, lead_no)').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('quotation_items').select('*').eq('quotation_id', id).order('day_no', { nullsFirst: false }).order('sort'),
    supabase.from('orgs').select('name, legal_name, address_line1, address_line2, mobile, email, gstin, states(name)').eq('id', org.id).single(),
    supabase.from('invoices').select('id, invoice_no, doc_kind').eq('quotation_id', id),
  ])
  if (!q) notFound()
  const { data: days } = q.itinerary_id
    ? await supabase.from('itinerary_days').select('day_no, title, description, cities(name)').eq('itinerary_id', q.itinerary_id).order('day_no')
    : { data: [] }
  const n = (v: unknown) => (v as { name: string } | null)?.name
  const pax = q.adults + q.children
  const lead = q.leads as unknown as { id: string; lead_no: string } | null
  const groups = Object.entries((items ?? []).reduce<Record<string, string[]>>((g, it) => ((g[it.kind] ??= []).push(it.description), g), {}))
  const dt = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '')
  const endDate = q.start_date && q.nights !== null ? new Date(new Date(q.start_date).getTime() + q.nights * 86400000).toISOString().slice(0, 10) : null

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{q.quote_no}</h1>
          <Badge variant={q.status === 'accepted' ? 'default' : q.status === 'rejected' ? 'outline' : 'secondary'}>{label(QUOTE_STATUSES, q.status)}</Badge>
          {lead && <Link href={`/crm/leads/${lead.id}`} className="text-sm text-muted-foreground underline">{lead.lead_no}</Link>}
          {proformas?.map((p) => (
            <Link key={p.id} href={`/billing/invoices/${p.id}`} className="text-sm text-muted-foreground underline">{p.invoice_no}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <LinkButton href={`/crm/quotations/${q.id}/edit`} variant="outline">Edit</LinkButton>
          {q.party_ledger_id ? (
            <LinkButton href={`/billing/proformas/new?quotation=${q.id}`}>Make proforma</LinkButton>
          ) : (
            <span className="self-center text-xs text-muted-foreground">Link a client account (Edit) to raise a proforma</span>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm sm:grid-cols-[1fr_auto] print:hidden">
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex gap-2"><dt className="text-muted-foreground">Cost</dt><dd className="tabular-nums">{formatINR(q.cost_total)}</dd></div>
          <div className="flex gap-2"><dt className="text-muted-foreground">Margin</dt><dd className="tabular-nums">{formatINR(q.markup)}{Number(q.subtotal) > 0 && ` (${Math.round((Number(q.markup) / Number(q.subtotal)) * 100)}%)`}</dd></div>
          <div className="flex gap-2"><dt className="text-muted-foreground">Internal only — not printed</dt></div>
        </dl>
        <div className="flex flex-wrap gap-1">
          {QUOTE_STATUSES.filter(([s]) => s !== q.status).map(([s, l]) => (
            <form key={s} action={setQuotationStatus}>
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="status" value={s} />
              <Button type="submit" size="sm" variant="outline">Mark {l.toLowerCase()}</Button>
            </form>
          ))}
        </div>
      </div>

      <article className="mx-auto grid max-w-4xl gap-6 rounded-xl border bg-white p-8 text-sm text-neutral-900 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-6 border-b pb-4">
          <div>
            <p className="text-lg font-semibold">{company?.legal_name || company?.name}</p>
            <p>{[company?.address_line1, company?.address_line2, n(company?.states)].filter(Boolean).join(', ')}</p>
            <p>{[company?.mobile, company?.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-wide">QUOTATION</p>
            <p>No. {q.quote_no} · {dt(q.quote_date)}</p>
            {q.valid_until && <p>Valid until {dt(q.valid_until)}</p>}
          </div>
        </header>

        <section className="grid gap-1">
          <p className="text-xs text-neutral-500 uppercase">Prepared for</p>
          <p className="text-base font-medium">{q.client_name}</p>
          <p className="mt-2 text-xl font-semibold">{n(q.ptitle) || n(q.routes) || 'Holiday package'}</p>
          <p className="text-neutral-600">
            {[n(q.routes), q.nights !== null && `${q.nights} nights / ${q.nights + 1} days`, q.start_date && `${dt(q.start_date)}${endDate ? ` – ${dt(endDate)}` : ''}`,
              `${q.adults} adult(s)${q.children ? `, ${q.children} child(ren)` : ''}${q.infants ? `, ${q.infants} infant(s)` : ''}`, n(q.meal)].filter(Boolean).join(' · ')}
          </p>
        </section>

        {days && days.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Itinerary</h2>
            <ol className="grid gap-3">
              {days.map((d) => (
                <li key={d.day_no} className="grid grid-cols-[60px_1fr] gap-3">
                  <span className="font-semibold">Day {d.day_no}</span>
                  <div>
                    <p className="font-medium">{d.title}{n(d.cities) && <span className="font-normal text-neutral-500"> · {n(d.cities)}</span>}</p>
                    {d.description && <p className="whitespace-pre-line text-neutral-600">{d.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="grid gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">What&apos;s included</h2>
          {groups.map(([kind, descs]) => (
            <div key={kind}>
              <p className="font-medium">{KIND[kind] ?? kind}</p>
              <ul className="list-disc pl-5 text-neutral-700">{descs.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          ))}
          {q.inclusions && <p className="whitespace-pre-line text-neutral-700">{q.inclusions}</p>}
        </section>

        <section className="grid gap-1 justify-self-end rounded-lg border p-4 sm:min-w-72">
          <div className="flex justify-between gap-6"><span>Package price</span><span className="tabular-nums">{formatINR(q.subtotal)}</span></div>
          {Number(q.tax_total) > 0 && <div className="flex justify-between gap-6"><span>GST @ {Number(q.gst_rate)}%</span><span className="tabular-nums">{formatINR(q.tax_total)}</span></div>}
          <div className="flex justify-between gap-6 border-t pt-1 text-base font-semibold"><span>Total</span><span className="tabular-nums">{formatINR(q.grand_total)}</span></div>
          {pax > 0 && <div className="flex justify-between gap-6 text-neutral-600"><span>Per person</span><span className="tabular-nums">{formatINR(Math.round(Number(q.grand_total) / pax))}</span></div>}
        </section>

        {q.exclusions && (
          <section><h2 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Not included</h2><p className="whitespace-pre-line text-neutral-700">{q.exclusions}</p></section>
        )}
        {q.terms && (
          <section><h2 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Terms & policies</h2><p className="whitespace-pre-line text-xs text-neutral-600">{q.terms}</p></section>
        )}
      </article>
    </>
  )
}
