'use client'

import { useActionState, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { computeLine, computeTax, GST_RATES } from '@/lib/gst'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import { saveCreditNote } from './actions'

export type OrigLine = {
  id: string
  label: string
  detail: string
  basic: number
  xt: number
  service_fee: number
  other_charges: number
  gst_rate: number
  gst_on: 'service' | 'full'
  net_sale: number
  has_supplier: boolean
  purchase_gross: number
  commission: number
  tds: number
}

type Row = { line_id: string; include: boolean; basic: string; xt: string; service_fee: string; other_charges: string; purchase_refund: string; commission: string; tds: string }

export function CreditNoteForm({
  invoiceId,
  invoiceNo,
  lines,
  interstate,
  noGst,
  today,
}: {
  invoiceId: string
  invoiceNo: string
  lines: OrigLine[]
  interstate: boolean
  noGst: boolean
  today: string
}) {
  const [state, action] = useActionState(saveCreditNote, undefined)
  const [rows, setRows] = useState<Row[]>(
    lines.map((l) => ({
      line_id: l.id,
      include: true,
      basic: paiseToInput(l.basic),
      xt: paiseToInput(l.xt),
      service_fee: '',
      other_charges: '',
      purchase_refund: paiseToInput(l.purchase_gross),
      commission: paiseToInput(l.commission),
      tds: paiseToInput(l.tds),
    })),
  )
  const [date, setDate] = useState(today)
  const [charges, setCharges] = useState('')
  const [rate, setRate] = useState(noGst ? '0' : '18')
  const [notes, setNotes] = useState('')
  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const preview = useMemo(() => {
    let refund = 0
    let supplier = 0
    rows.forEach((r, i) => {
      if (!r.include) return
      const t = computeLine(
        {
          basic: toPaise(r.basic), xt: toPaise(r.xt), service_fee: toPaise(r.service_fee), other_charges: toPaise(r.other_charges),
          discount: 0, gst_rate: lines[i].gst_rate, gst_on: lines[i].gst_on,
          purchase_gross: toPaise(r.purchase_refund), purchase_gst: 0, commission: toPaise(r.commission), tds: toPaise(r.tds),
        },
        interstate,
      )
      refund += t.net_sale
      supplier += t.net_purchase
    })
    const c = toPaise(charges)
    const tax = computeTax(c, Number(rate), interstate)
    const chargesTotal = c + tax.cgst + tax.sgst + tax.igst
    return { gross: refund, chargesTotal, refund: refund - chargesTotal, supplier }
  }, [rows, charges, rate, interstate, lines])

  const money = (i: number, k: keyof Row, label: string, max?: number) => (
    <Field label={label} htmlFor={`${k}-${i}`} hint={max !== undefined ? `of ${formatINR(max)}` : undefined}>
      <Input
        id={`${k}-${i}`}
        inputMode="decimal"
        className="text-right tabular-nums"
        value={rows[i][k] as string}
        disabled={!rows[i].include}
        onChange={(e) => setRow(i, { [k]: e.target.value })}
      />
    </Field>
  )

  return (
    <form action={action} className="grid max-w-5xl gap-6">
      <input type="hidden" name="payload" value={JSON.stringify({ invoice_id: invoiceId, date, notes, charges, charges_rate: rate, lines: rows })} />

      {lines.map((l, i) => (
        <section key={l.id} className="grid gap-3 rounded-3xl bg-card p-5">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 size-4" checked={rows[i].include} onChange={(e) => setRow(i, { include: e.target.checked })} />
            <span>
              <span className="font-medium">{l.label}</span>
              <span className="block text-sm text-muted-foreground">{l.detail} · billed {formatINR(l.net_sale)}</span>
            </span>
          </label>
          {rows[i].include && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {money(i, 'basic', 'Refund basic', l.basic)}
                {l.xt > 0 && money(i, 'xt', 'Refund taxes', l.xt)}
                {l.service_fee > 0 && money(i, 'service_fee', 'Refund service fee', l.service_fee)}
                {l.other_charges > 0 && money(i, 'other_charges', 'Refund other charges', l.other_charges)}
              </div>
              {l.has_supplier && (
                <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/60 p-4 sm:grid-cols-4">
                  {money(i, 'purchase_refund', 'Supplier refunds', l.purchase_gross)}
                  {l.commission > 0 && money(i, 'commission', 'Commission reversed', l.commission)}
                  {l.tds > 0 && money(i, 'tds', 'TDS reversed', l.tds)}
                </div>
              )}
            </>
          )}
        </section>
      ))}

      <section className="grid gap-4 rounded-3xl bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Credit note date" htmlFor="date" required>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Your cancellation charges (₹)" htmlFor="charges" hint="Kept from the refund">
          <Input id="charges" inputMode="decimal" className="text-right tabular-nums" value={charges} onChange={(e) => setCharges(e.target.value)} />
        </Field>
        {!noGst && (
          <Field label="GST on charges" htmlFor="rate">
            <NativeSelect id="rate" value={rate} onChange={(e) => setRate(e.target.value)}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-4">
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </section>

      <dl className="grid max-w-sm gap-1.5 justify-self-end text-sm">
        <div className="flex justify-between gap-6"><dt className="text-muted-foreground">Refund of billed amount</dt><dd className="tabular-nums">{formatINR(preview.gross)}</dd></div>
        <div className="flex justify-between gap-6"><dt className="text-muted-foreground">Less charges incl. GST</dt><dd className="tabular-nums">−{formatINR(preview.chargesTotal)}</dd></div>
        <div className="flex justify-between gap-6 border-t pt-1 font-semibold"><dt>Credit to client</dt><dd className="tabular-nums">{formatINR(preview.refund)}</dd></div>
        <div className="flex justify-between gap-6"><dt className="text-muted-foreground">Due from suppliers</dt><dd className="tabular-nums">{formatINR(preview.supplier)}</dd></div>
      </dl>

      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save credit note</SubmitButton>
        <LinkButton href={`/billing/invoices/${invoiceId}`} variant="outline">Back to {invoiceNo}</LinkButton>
      </div>
    </form>
  )
}
