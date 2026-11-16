'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { computeLine, GST_RATES } from '@/lib/gst'
import { formatINR, toPaise } from '@/lib/money'
import { BILL_TYPES, emptyLine, type InvoiceDraft, type LineDraft } from '@/lib/invoice'
import { saveInvoice } from './actions'

type Party = { id: string; name: string; state_id: string | null; mobile: string | null }
type Option = { id: string; name: string }

export function InvoiceForm({
  draft: initial,
  customers,
  suppliers,
  states,
  airlines,
  orgStateId,
}: {
  draft: InvoiceDraft
  customers: Party[]
  suppliers: Option[]
  states: { id: string; name: string; gst_code: string }[]
  airlines: { id: string; code: string; name: string }[]
  orgStateId: string | null
}) {
  const [state, action] = useActionState(saveInvoice, undefined)
  const [draft, setDraft] = useState<InvoiceDraft>(initial)
  const interstate = !!orgStateId && !!draft.place_of_supply_state_id && orgStateId !== draft.place_of_supply_state_id

  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))

  const computed = useMemo(
    () =>
      draft.lines.map((l) =>
        computeLine(
          {
            basic: toPaise(l.basic),
            xt: toPaise(l.xt),
            service_fee: toPaise(l.service_fee),
            other_charges: toPaise(l.other_charges),
            discount: toPaise(l.discount),
            gst_rate: Number(l.gst_rate),
            purchase_gross: toPaise(l.purchase_gross),
            purchase_gst: toPaise(l.purchase_gst),
            commission: toPaise(l.commission),
            tds: toPaise(l.tds),
          },
          interstate,
        ),
      ),
    [draft.lines, interstate],
  )
  const totals = computed.reduce(
    (a, c) => ({
      taxable: a.taxable + c.taxable,
      cgst: a.cgst + c.cgst,
      sgst: a.sgst + c.sgst,
      igst: a.igst + c.igst,
      net_sale: a.net_sale + c.net_sale,
      net_purchase: a.net_purchase + c.net_purchase,
      margin: a.margin + c.margin,
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, net_sale: 0, net_purchase: 0, margin: 0 },
  )

  function chooseParty(id: string) {
    const p = customers.find((c) => c.id === id)
    setDraft((d) => ({
      ...d,
      party_ledger_id: id,
      place_of_supply_state_id: p?.state_id ?? d.place_of_supply_state_id,
      contact_phone: d.contact_phone || p?.mobile || '',
    }))
  }

  const money = (i: number, k: keyof LineDraft, label: string) => (
    <Field label={label} htmlFor={`${k}-${i}`}>
      <Input
        id={`${k}-${i}`}
        inputMode="decimal"
        className="text-right tabular-nums"
        value={draft.lines[i][k]}
        onChange={(e) => setLine(i, { [k]: e.target.value })}
      />
    </Field>
  )

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(draft)} />

      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Invoice type" htmlFor="bill_type" required>
          <NativeSelect id="bill_type" value={draft.bill_type} onChange={(e) => set('bill_type', e.target.value)}>
            {BILL_TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Invoice date" htmlFor="invoice_date" required>
          <Input id="invoice_date" type="date" value={draft.invoice_date} onChange={(e) => set('invoice_date', e.target.value)} required />
        </Field>
        <Field label="Due date" htmlFor="due_date">
          <Input id="due_date" type="date" value={draft.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </Field>
        <Field label="Contact phone" htmlFor="contact_phone">
          <Input id="contact_phone" type="tel" value={draft.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
        </Field>
        <Field
          label="Client"
          htmlFor="party"
          required
          className="sm:col-span-2"
          hint={customers.length ? undefined : 'No clients yet: add one first.'}
        >
          <div className="flex gap-2">
            <NativeSelect id="party" value={draft.party_ledger_id} onChange={(e) => chooseParty(e.target.value)} required>
              <option value="">Select client</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
            <LinkButton
              variant="outline"
              href={`/masters/ledgers/new?kind=customer&return_to=${encodeURIComponent(draft.id ? `/billing/invoices/${draft.id}/edit` : '/billing/invoices/new')}`}
            >
              New
            </LinkButton>
          </div>
        </Field>
        <Field
          label="Place of supply"
          htmlFor="pos"
          required
          className="sm:col-span-2"
          hint={draft.place_of_supply_state_id ? (interstate ? 'Inter-state: IGST' : 'Intra-state: CGST + SGST') : undefined}
        >
          <NativeSelect id="pos" value={draft.place_of_supply_state_id} onChange={(e) => set('place_of_supply_state_id', e.target.value)} required>
            <option value="">Select state</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>{s.gst_code} – {s.name}</option>
            ))}
          </NativeSelect>
        </Field>
      </section>

      {draft.lines.map((l, i) => {
        const c = computed[i]
        return (
          <section key={i} className="grid gap-4 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Passenger {i + 1}</h2>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines.slice(0, i + 1), { ...l, pax_name: '', ticket_no: '' }, ...d.lines.slice(i + 1)] }))}
                >
                  <Copy /> Same flight, next pax
                </Button>
                {draft.lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove passenger ${i + 1}`}
                    onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <Field label="Passenger name" htmlFor={`pax-${i}`} required className="sm:col-span-2">
                <Input id={`pax-${i}`} className="uppercase" value={l.pax_name} onChange={(e) => setLine(i, { pax_name: e.target.value })} />
              </Field>
              <Field label="Type" htmlFor={`ptype-${i}`}>
                <NativeSelect id={`ptype-${i}`} value={l.pax_type} onChange={(e) => setLine(i, { pax_type: e.target.value as LineDraft['pax_type'] })}>
                  <option value="adult">Adult</option>
                  <option value="child">Child</option>
                  <option value="infant">Infant</option>
                </NativeSelect>
              </Field>
              <Field label="Airline" htmlFor={`air-${i}`}>
                <NativeSelect id={`air-${i}`} value={l.airline_id} onChange={(e) => setLine(i, { airline_id: e.target.value })}>
                  <option value="">—</option>
                  {airlines.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Flight no." htmlFor={`fl-${i}`}>
                <Input id={`fl-${i}`} className="uppercase" value={l.flight_no} onChange={(e) => setLine(i, { flight_no: e.target.value })} />
              </Field>
              <Field label="Sector" htmlFor={`sec-${i}`}>
                <Input id={`sec-${i}`} className="uppercase" placeholder="DEL-BOM" value={l.sector} onChange={(e) => setLine(i, { sector: e.target.value })} />
              </Field>
              <Field label="Travel date" htmlFor={`td-${i}`}>
                <Input id={`td-${i}`} type="date" value={l.travel_date} onChange={(e) => setLine(i, { travel_date: e.target.value })} />
              </Field>
              <Field label="Return date" htmlFor={`rd-${i}`}>
                <Input id={`rd-${i}`} type="date" value={l.return_date} onChange={(e) => setLine(i, { return_date: e.target.value })} />
              </Field>
              <Field label="PNR" htmlFor={`pnr-${i}`}>
                <Input id={`pnr-${i}`} className="uppercase" value={l.pnr} onChange={(e) => setLine(i, { pnr: e.target.value })} />
              </Field>
              <Field label="Ticket no." htmlFor={`tkt-${i}`}>
                <Input id={`tkt-${i}`} value={l.ticket_no} onChange={(e) => setLine(i, { ticket_no: e.target.value })} />
              </Field>
            </div>

            <div className="grid gap-3 rounded-lg bg-muted/40 p-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Sale to client (₹)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {money(i, 'basic', 'Base fare')}
                {money(i, 'xt', 'Taxes (XT)')}
                {money(i, 'service_fee', 'Service fee')}
                {money(i, 'other_charges', 'Other charges')}
                {money(i, 'discount', 'Discount')}
                <Field label="GST %" htmlFor={`gst-${i}`} hint="on fee + charges">
                  <NativeSelect id={`gst-${i}`} value={l.gst_rate} onChange={(e) => setLine(i, { gst_rate: e.target.value })}>
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>{r}%</option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </div>

            <div className="grid gap-3 rounded-lg bg-muted/40 p-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Purchase from supplier (₹)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="Supplier" htmlFor={`sup-${i}`} className="col-span-2">
                  <NativeSelect id={`sup-${i}`} value={l.supplier_ledger_id} onChange={(e) => setLine(i, { supplier_ledger_id: e.target.value })}>
                    <option value="">—</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Supplier inv. no." htmlFor={`sinv-${i}`}>
                  <Input id={`sinv-${i}`} value={l.supplier_invoice_no} onChange={(e) => setLine(i, { supplier_invoice_no: e.target.value })} />
                </Field>
                {money(i, 'purchase_gross', 'Purchase amount')}
                {money(i, 'commission', 'Commission')}
                {money(i, 'tds', 'TDS on comm.')}
              </div>
            </div>

            <dl className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
              {interstate ? (
                <div className="flex gap-2"><dt className="text-muted-foreground">IGST</dt><dd className="tabular-nums">{formatINR(c.igst)}</dd></div>
              ) : (
                <div className="flex gap-2"><dt className="text-muted-foreground">CGST + SGST</dt><dd className="tabular-nums">{formatINR(c.cgst + c.sgst)}</dd></div>
              )}
              <div className="flex gap-2"><dt className="text-muted-foreground">Sale</dt><dd className="font-medium tabular-nums">{formatINR(c.net_sale)}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground">Payable to supplier</dt><dd className="tabular-nums">{formatINR(c.net_purchase)}</dd></div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Margin</dt>
                <dd className={c.margin < 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>{formatINR(c.margin)}</dd>
              </div>
            </dl>
          </section>
        )
      })}

      <div>
        <Button type="button" variant="outline" onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine()] }))}>
          <Plus /> Add passenger
        </Button>
      </div>

      <section className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[1fr_320px]">
        <Field label="Notes (printed on invoice)" htmlFor="notes">
          <Textarea id="notes" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <dl className="grid content-start gap-1.5 text-sm">
          <Row label="Taxable value" v={totals.taxable} />
          {interstate ? <Row label="IGST" v={totals.igst} /> : (<><Row label="CGST" v={totals.cgst} /><Row label="SGST" v={totals.sgst} /></>)}
          <div className="my-1 border-t" />
          <Row label="Invoice total" v={totals.net_sale} strong />
          <Row label="Payable to suppliers" v={totals.net_purchase} />
          <Row label="Margin" v={totals.margin} />
        </dl>
      </section>

      <FormError state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{draft.id ? 'Save & re-post invoice' : 'Save & post invoice'}</SubmitButton>
        <LinkButton href={draft.id ? `/billing/invoices/${draft.id}` : '/billing/invoices'} variant="outline">Cancel</LinkButton>
        {!suppliers.length && (
          <p className="text-xs text-muted-foreground">
            Tip: <Link href="/masters/ledgers/new?kind=supplier" className="underline">add a supplier</Link> to record the purchase side and margin.
          </p>
        )}
      </div>
    </form>
  )
}

function Row({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{formatINR(v)}</dd>
    </div>
  )
}
