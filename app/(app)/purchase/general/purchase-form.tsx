'use client'

import { useActionState, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { computeTax, GST_RATES } from '@/lib/gst'
import { formatINR, toPaise } from '@/lib/money'
import { savePurchaseBill } from './actions'
import type { PLine, PurchaseDraft } from '@/lib/purchase'
import { blankPLine } from '@/lib/purchase'


export function PurchaseForm({
  draft: initial,
  suppliers,
  accounts,
  states,
  orgStateId,
}: {
  draft: PurchaseDraft
  suppliers: { id: string; name: string; state_id: string | null }[]
  accounts: { id: string; name: string }[]
  states: { id: string; name: string; gst_code: string }[]
  orgStateId: string | null
}) {
  const [state, action] = useActionState(savePurchaseBill, undefined)
  const [d, setD] = useState<PurchaseDraft>(initial)
  const set = <K extends keyof PurchaseDraft>(k: K, v: PurchaseDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const setLine = (i: number, patch: Partial<PLine>) => setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const inter = !!orgStateId && !!d.place_of_supply_state_id && orgStateId !== d.place_of_supply_state_id

  const calc = d.lines.map((l) => {
    const taxable = toPaise(l.taxable)
    const t = computeTax(taxable, Number(l.gst_rate), inter)
    return { taxable, tax: t.cgst + t.sgst + t.igst, ...t }
  })
  const taxable = calc.reduce((s, c) => s + c.taxable, 0)
  const tax = calc.reduce((s, c) => s + c.tax, 0)
  const tds = toPaise(d.tds)

  return (
    <form action={action} className="grid max-w-5xl gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(d)} />
      <section className="grid gap-4 rounded-3xl bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Supplier" htmlFor="supplier" required className="sm:col-span-2 lg:col-span-1">
          <div className="flex gap-2">
            <NativeSelect
              id="supplier"
              value={d.supplier_ledger_id}
              onChange={(e) => {
                const s = suppliers.find((x) => x.id === e.target.value)
                setD((x) => ({ ...x, supplier_ledger_id: e.target.value, place_of_supply_state_id: s?.state_id ?? x.place_of_supply_state_id }))
              }}
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </NativeSelect>
            <LinkButton variant="outline" href={`/masters/ledgers/new?kind=supplier&return_to=${encodeURIComponent('/purchase/general/new')}`}>New</LinkButton>
          </div>
        </Field>
        <Field label="Bill date" htmlFor="bill_date" required>
          <Input id="bill_date" type="date" value={d.bill_date} onChange={(e) => set('bill_date', e.target.value)} />
        </Field>
        <Field label="Place of supply" htmlFor="pos" required hint={d.place_of_supply_state_id ? (inter ? 'IGST' : 'CGST + SGST') : undefined}>
          <NativeSelect id="pos" value={d.place_of_supply_state_id} onChange={(e) => set('place_of_supply_state_id', e.target.value)}>
            <option value="">Select state</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>{s.gst_code} – {s.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Supplier's bill no." htmlFor="sbn">
          <Input id="sbn" value={d.supplier_bill_no} onChange={(e) => set('supplier_bill_no', e.target.value)} />
        </Field>
        <Field label="Supplier's bill date" htmlFor="sbd">
          <Input id="sbd" type="date" value={d.supplier_bill_date} onChange={(e) => set('supplier_bill_date', e.target.value)} />
        </Field>
      </section>

      <section className="grid gap-2 rounded-3xl bg-card p-5">
        <div className="hidden grid-cols-[1fr_1fr_140px_90px_120px_32px] gap-2 text-xs font-medium text-muted-foreground lg:grid">
          <span>Expense account</span><span>Description</span><span className="text-right">Amount (ex GST)</span><span>GST</span><span className="text-right">Total</span><span />
        </div>
        {d.lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_140px_90px_120px_32px]">
            <NativeSelect aria-label={`Account line ${i + 1}`} value={l.ledger_id} onChange={(e) => setLine(i, { ledger_id: e.target.value })}>
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </NativeSelect>
            <Input aria-label={`Description line ${i + 1}`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
            <Input aria-label={`Amount line ${i + 1}`} inputMode="decimal" className="text-right tabular-nums" value={l.taxable} onChange={(e) => setLine(i, { taxable: e.target.value })} />
            <NativeSelect aria-label={`GST line ${i + 1}`} value={l.gst_rate} onChange={(e) => setLine(i, { gst_rate: e.target.value })}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </NativeSelect>
            <span className="flex h-8 items-center justify-end text-sm tabular-nums">{formatINR(calc[i].taxable + calc[i].tax)}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} disabled={d.lines.length <= 1}
              onClick={() => setD((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setD((x) => ({ ...x, lines: [...x.lines, blankPLine()] }))}>
            <Plus /> Add line
          </Button>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl bg-card p-5 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-4">
          <Field label="TDS deducted by you (₹)" htmlFor="tds" hint="e.g. 10% on rent or professional fees; reduces what you pay the supplier">
            <Input id="tds" inputMode="decimal" className="max-w-48 text-right tabular-nums" value={d.tds} onChange={(e) => set('tds', e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        <dl className="grid content-start gap-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Taxable</dt><dd className="tabular-nums">{formatINR(taxable)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">{inter ? 'IGST' : 'CGST + SGST'} (input credit)</dt><dd className="tabular-nums">{formatINR(tax)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Bill total</dt><dd className="tabular-nums">{formatINR(taxable + tax)}</dd></div>
          {tds > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Less TDS</dt><dd className="tabular-nums">−{formatINR(tds)}</dd></div>}
          <div className="flex justify-between border-t pt-1 font-semibold"><dt>Payable to supplier</dt><dd className="tabular-nums">{formatINR(taxable + tax - tds)}</dd></div>
        </dl>
      </section>

      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>{d.id ? 'Save & re-post bill' : 'Save & post bill'}</SubmitButton>
        <LinkButton href={d.id ? `/purchase/general/${d.id}` : '/purchase/general'} variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
