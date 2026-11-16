'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { computeLine, GST_RATES, type GstOn } from '@/lib/gst'
import { formatINR, toPaise } from '@/lib/money'
import { BILL_TYPES, BILL_TYPE_KEYS, emptyLine, type BillType, type InvoiceDraft, type LineDraft, type Service } from '@/lib/invoice'
import { cn } from '@/lib/utils'
import { saveInvoice } from './actions'

type Party = { id: string; name: string; state_id: string | null; mobile: string | null }
type Option = { id: string; name: string }

const SERVICE_LABEL: Record<Service, string> = {
  flight: 'Flight', hotel: 'Hotel', visa: 'Visa', insurance: 'Insurance', train: 'Train', bus: 'Bus',
  taxi: 'Taxi', misc: 'Misc', tour: 'Tour', commission: 'Commission',
}

export function InvoiceForm({
  draft: initial,
  customers,
  suppliers,
  states,
  airlines,
  bookedBy,
  passengers,
  orgStateId,
}: {
  draft: InvoiceDraft
  customers: Party[]
  suppliers: Option[]
  states: { id: string; name: string; gst_code: string }[]
  airlines: { id: string; code: string; name: string }[]
  bookedBy: Option[]
  passengers: string[]
  orgStateId: string | null
}) {
  const [state, action] = useActionState(saveInvoice, undefined)
  const [draft, setDraft] = useState<InvoiceDraft>(initial)
  const cfg = BILL_TYPES[draft.bill_type]
  const isPf = draft.doc_kind === 'proforma'
  const docLabel = isPf ? 'proforma' : 'invoice'
  const interstate = !!orgStateId && !!draft.place_of_supply_state_id && orgStateId !== draft.place_of_supply_state_id

  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const setField = (i: number, key: string, value: string) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, fields: { ...l.fields, [key]: value } } : l)) }))

  function changeType(bt: BillType) {
    const next = BILL_TYPES[bt]
    setDraft((d) => ({
      ...d,
      bill_type: bt,
      lines: d.lines.map((l) => ({
        ...l,
        service: next.services.includes(l.service) ? l.service : next.services[0],
        gst_on: next.gstOn,
        gst_rate: String(next.gstRate),
        xt: next.amounts.xt ? l.xt : '',
        ...(next.purchase ? {} : { supplier_ledger_id: '', purchase_gross: '', purchase_gst: '', commission: '', tds: '' }),
      })),
    }))
  }

  const computed = useMemo(
    () =>
      draft.lines.map((l) =>
        computeLine(
          {
            basic: toPaise(l.basic),
            xt: cfg.amounts.xt ? toPaise(l.xt) : 0,
            service_fee: toPaise(l.service_fee),
            other_charges: toPaise(l.other_charges),
            discount: toPaise(l.discount),
            gst_rate: cfg.noGst ? 0 : Number(l.gst_rate),
            gst_on: l.gst_on,
            purchase_gross: toPaise(l.purchase_gross),
            purchase_gst: toPaise(l.purchase_gst),
            commission: toPaise(l.commission),
            tds: toPaise(l.tds),
          },
          interstate,
        ),
      ),
    [draft.lines, interstate, cfg],
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
        value={draft.lines[i][k] as string}
        onChange={(e) => setLine(i, { [k]: e.target.value })}
      />
    </Field>
  )
  const returnHere = encodeURIComponent(draft.id ? `/billing/invoices/${draft.id}/edit` : '/billing/invoices/new')

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(draft)} />
      <datalist id="passenger-names">
        {passengers.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={isPf ? 'Proforma type' : 'Invoice type'} htmlFor="bill_type" required>
          <NativeSelect id="bill_type" value={draft.bill_type} onChange={(e) => changeType(e.target.value as BillType)} disabled={!!draft.id}>
            {BILL_TYPE_KEYS.map((v) => (
              <option key={v} value={v}>{BILL_TYPES[v].label}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={isPf ? 'Proforma date' : 'Invoice date'} htmlFor="invoice_date" required>
          <Input id="invoice_date" type="date" value={draft.invoice_date} onChange={(e) => set('invoice_date', e.target.value)} required />
        </Field>
        <Field label="Due date" htmlFor="due_date">
          <Input id="due_date" type="date" value={draft.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </Field>
        <Field label="Booked by" htmlFor="booked_by" hint={bookedBy.length ? undefined : 'Add names under Masters → Lists'}>
          <NativeSelect id="booked_by" value={draft.booked_by_id} onChange={(e) => set('booked_by_id', e.target.value)}>
            <option value="">—</option>
            {bookedBy.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Client" htmlFor="party" required className="sm:col-span-2" hint={customers.length ? undefined : 'No clients yet: add one first.'}>
          <div className="flex gap-2">
            <NativeSelect id="party" value={draft.party_ledger_id} onChange={(e) => chooseParty(e.target.value)} required>
              <option value="">Select client</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
            <LinkButton variant="outline" href={`/masters/ledgers/new?kind=customer&return_to=${returnHere}`}>New</LinkButton>
          </div>
        </Field>
        <Field
          label="Place of supply"
          htmlFor="pos"
          required
          hint={cfg.noGst ? 'No GST on a bill of supply' : draft.place_of_supply_state_id ? (interstate ? 'Inter-state: IGST' : 'Intra-state: CGST + SGST') : undefined}
        >
          <NativeSelect id="pos" value={draft.place_of_supply_state_id} onChange={(e) => set('place_of_supply_state_id', e.target.value)} required>
            <option value="">Select state</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>{s.gst_code} – {s.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Contact phone" htmlFor="contact_phone">
          <Input id="contact_phone" type="tel" value={draft.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
        </Field>
      </section>

      {draft.lines.map((l, i) => {
        const c = computed[i]
        return (
          <section key={i} className="grid gap-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium">Line {i + 1}</h2>
                {cfg.services.length > 1 && (
                  <div className="flex gap-1" role="radiogroup" aria-label={`Line ${i + 1} service`}>
                    {cfg.services.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={l.service === s}
                        onClick={() => setLine(i, { service: s })}
                        className={cn('rounded-md border px-2 py-0.5 text-xs', l.service === s && 'border-primary bg-primary/10')}
                      >
                        {SERVICE_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft((d) => ({ ...d, lines: [...d.lines.slice(0, i + 1), { ...l, pax_name: '', fields: { ...l.fields, ticket_no: '' } }, ...d.lines.slice(i + 1)] }))
                  }
                >
                  <Copy /> Copy line
                </Button>
                {draft.lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <Field label={cfg.paxLabel} htmlFor={`pax-${i}`} className="sm:col-span-2">
                <Input id={`pax-${i}`} list="passenger-names" className="uppercase" value={l.pax_name} onChange={(e) => setLine(i, { pax_name: e.target.value })} />
              </Field>
              {['flight', 'train', 'bus'].includes(l.service) && (
                <Field label="Type" htmlFor={`ptype-${i}`}>
                  <NativeSelect id={`ptype-${i}`} value={l.pax_type} onChange={(e) => setLine(i, { pax_type: e.target.value as LineDraft['pax_type'] })}>
                    <option value="adult">Adult</option>
                    <option value="child">Child</option>
                    <option value="infant">Infant</option>
                  </NativeSelect>
                </Field>
              )}
              {cfg.fields.map((f) => (
                <Field key={f.key} label={f.label} htmlFor={`${f.key}-${i}`} required={f.required} className={f.wide ? 'sm:col-span-2' : undefined}>
                  {f.type === 'airline' ? (
                    <NativeSelect id={`${f.key}-${i}`} value={l.fields[f.key] ?? ''} onChange={(e) => setField(i, f.key, e.target.value)}>
                      <option value="">—</option>
                      {airlines.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={`${f.key}-${i}`}
                      type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                      min={f.type === 'number' ? 0 : undefined}
                      placeholder={f.placeholder}
                      className={f.upper ? 'uppercase' : undefined}
                      value={l.fields[f.key] ?? ''}
                      onChange={(e) => setField(i, f.key, e.target.value)}
                    />
                  )}
                </Field>
              ))}
            </div>

            <div className="grid gap-3 rounded-lg bg-muted/40 p-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Sale to client (₹)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {money(i, 'basic', cfg.amounts.basic)}
                {cfg.amounts.xt && money(i, 'xt', cfg.amounts.xt)}
                {money(i, 'service_fee', 'Service fee')}
                {money(i, 'other_charges', 'Other charges')}
                {money(i, 'discount', 'Discount')}
                {!cfg.noGst && (
                  <>
                    <Field label="GST on" htmlFor={`gston-${i}`}>
                      <NativeSelect id={`gston-${i}`} value={l.gst_on} onChange={(e) => setLine(i, { gst_on: e.target.value as GstOn })}>
                        <option value="service">Service charges</option>
                        <option value="full">Full value</option>
                      </NativeSelect>
                    </Field>
                    <Field label="GST %" htmlFor={`gst-${i}`}>
                      <NativeSelect id={`gst-${i}`} value={l.gst_rate} onChange={(e) => setLine(i, { gst_rate: e.target.value })}>
                        {GST_RATES.map((r) => (
                          <option key={r} value={r}>{r}%</option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </>
                )}
              </div>
            </div>

            {cfg.purchase && (
              <div className="grid gap-3 rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Purchase from supplier (₹)</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
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
                  {money(i, 'purchase_gst', 'of which GST (ITC)')}
                  {money(i, 'commission', 'Commission')}
                  {money(i, 'tds', 'TDS on comm.')}
                </div>
              </div>
            )}

            <dl className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
              {!cfg.noGst && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{interstate ? 'IGST' : 'CGST + SGST'}</dt>
                  <dd className="tabular-nums">{formatINR(c.cgst + c.sgst + c.igst)}</dd>
                </div>
              )}
              <div className="flex gap-2"><dt className="text-muted-foreground">Sale</dt><dd className="font-medium tabular-nums">{formatINR(c.net_sale)}</dd></div>
              {cfg.purchase && (
                <div className="flex gap-2"><dt className="text-muted-foreground">Payable to supplier</dt><dd className="tabular-nums">{formatINR(c.net_purchase)}</dd></div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Margin</dt>
                <dd className={c.margin < 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>{formatINR(c.margin)}</dd>
              </div>
            </dl>
          </section>
        )
      })}

      <div>
        <Button type="button" variant="outline" onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine(d.bill_type)] }))}>
          <Plus /> Add line
        </Button>
      </div>

      <section className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[1fr_320px]">
        <Field label={`Notes (printed on ${docLabel})`} htmlFor="notes">
          <Textarea id="notes" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <dl className="grid content-start gap-1.5 text-sm">
          {!cfg.noGst && <Row label="Taxable value" v={totals.taxable} />}
          {!cfg.noGst && (interstate ? <Row label="IGST" v={totals.igst} /> : (<><Row label="CGST" v={totals.cgst} /><Row label="SGST" v={totals.sgst} /></>))}
          <div className="my-1 border-t" />
          <Row label={isPf ? 'Proforma total' : 'Invoice total'} v={totals.net_sale} strong />
          {cfg.purchase && <Row label="Payable to suppliers" v={totals.net_purchase} />}
          <Row label="Margin" v={totals.margin} />
        </dl>
      </section>

      <FormError state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{isPf ? 'Save proforma' : draft.id ? 'Save & re-post invoice' : 'Save & post invoice'}</SubmitButton>
        <LinkButton href={draft.id ? `/billing/invoices/${draft.id}` : isPf ? '/billing/proformas' : '/billing/invoices'} variant="outline">Cancel</LinkButton>
        {cfg.purchase && !suppliers.length && (
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
