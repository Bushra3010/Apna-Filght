'use client'

import { useActionState, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import { saveReceipt } from './actions'

type Open = { id: string; invoice_no: string; invoice_date: string; party_ledger_id: string; balance: number }

export function ReceiptForm({
  customers,
  accounts,
  open,
  initialParty,
  initialInvoice,
  today,
}: {
  customers: { id: string; name: string }[]
  accounts: { id: string; name: string; kind: string }[]
  open: Open[]
  initialParty: string
  initialInvoice: string
  today: string
}) {
  const [state, action] = useActionState(saveReceipt, undefined)
  const preset = open.find((o) => o.id === initialInvoice)
  const [r, setR] = useState({
    party_ledger_id: initialParty,
    cash_bank_ledger_id: accounts.find((a) => a.kind === 'bank')?.id ?? accounts[0]?.id ?? '',
    voucher_date: today,
    amount: preset ? paiseToInput(preset.balance) : '',
    mode: 'upi',
    cheque_no: '',
    cheque_date: '',
    cheque_bank: '',
    reference: '',
    narration: '',
  })
  const [alloc, setAlloc] = useState<Record<string, string>>(preset ? { [preset.id]: paiseToInput(preset.balance) } : {})

  const partyOpen = open.filter((o) => o.party_ledger_id === r.party_ledger_id)
  const allocated = Object.entries(alloc)
    .filter(([id]) => partyOpen.some((o) => o.id === id))
    .reduce((s, [, v]) => s + toPaise(v), 0)
  const amount = toPaise(r.amount)

  // oldest invoice first
  function autoAllocate() {
    let left = amount
    const next: Record<string, string> = {}
    for (const o of [...partyOpen].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))) {
      const take = Math.min(left, o.balance)
      if (take > 0) next[o.id] = paiseToInput(take)
      left -= take
    }
    setAlloc(next)
  }

  const payload = {
    ...r,
    allocations: partyOpen.map((o) => ({ invoice_id: o.id, amount: alloc[o.id] ?? '' })),
  }
  const set = (k: keyof typeof r, v: string) => setR((x) => ({ ...x, [k]: v }))

  return (
    <form action={action} className="grid max-w-4xl gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Received from" htmlFor="party" required>
          <NativeSelect id="party" value={r.party_ledger_id} onChange={(e) => { set('party_ledger_id', e.target.value); setAlloc({}) }} required>
            <option value="">Select client</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Deposited to" htmlFor="account" required hint={accounts.length ? undefined : 'Add a bank account under Ledgers.'}>
          <NativeSelect id="account" value={r.cash_bank_ledger_id} onChange={(e) => set('cash_bank_ledger_id', e.target.value)} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Date" htmlFor="date" required>
          <Input id="date" type="date" value={r.voucher_date} onChange={(e) => set('voucher_date', e.target.value)} required />
        </Field>
        <Field label="Amount (₹)" htmlFor="amount" required>
          <Input id="amount" inputMode="decimal" className="text-right tabular-nums" value={r.amount} onChange={(e) => set('amount', e.target.value)} required />
        </Field>
        <Field label="Mode" htmlFor="mode">
          <NativeSelect id="mode" value={r.mode} onChange={(e) => set('mode', e.target.value)}>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer (NEFT/IMPS/RTGS)</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="card">Card</option>
          </NativeSelect>
        </Field>
        <Field label="Reference / UTR" htmlFor="reference">
          <Input id="reference" value={r.reference} onChange={(e) => set('reference', e.target.value)} />
        </Field>
        {r.mode === 'cheque' && (
          <>
            <Field label="Cheque no." htmlFor="cheque_no" required>
              <Input id="cheque_no" value={r.cheque_no} onChange={(e) => set('cheque_no', e.target.value)} />
            </Field>
            <Field label="Cheque date" htmlFor="cheque_date">
              <Input id="cheque_date" type="date" value={r.cheque_date} onChange={(e) => set('cheque_date', e.target.value)} />
            </Field>
            <Field label="Bank" htmlFor="cheque_bank">
              <Input id="cheque_bank" value={r.cheque_bank} onChange={(e) => set('cheque_bank', e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Narration" htmlFor="narration" className="sm:col-span-2 lg:col-span-3">
          <Input id="narration" value={r.narration} onChange={(e) => set('narration', e.target.value)} />
        </Field>
      </section>

      {r.party_ledger_id && (
        <section className="grid gap-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Adjust against invoices</h2>
            {partyOpen.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={autoAllocate} disabled={!amount}>
                Auto-adjust oldest first
              </Button>
            )}
          </div>
          {partyOpen.length ? (
            <div className="grid gap-2">
              {partyOpen.map((o) => (
                <div key={o.id} className="grid grid-cols-[1fr_auto_140px] items-center gap-3 text-sm">
                  <span>
                    {o.invoice_no} <span className="text-muted-foreground">· {new Date(o.invoice_date).toLocaleDateString('en-IN')}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">due {formatINR(o.balance)}</span>
                  <Input
                    aria-label={`Amount against ${o.invoice_no}`}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={alloc[o.id] ?? ''}
                    onChange={(e) => setAlloc((a) => ({ ...a, [o.id]: e.target.value }))}
                  />
                </div>
              ))}
              <p className={allocated > amount ? 'text-right text-sm text-destructive' : 'text-right text-sm text-muted-foreground'}>
                Adjusted {formatINR(allocated)} of {formatINR(amount)}
                {amount > allocated && ` · ${formatINR(amount - allocated)} on account`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No unpaid invoices for this client. The receipt will be kept on account.</p>
          )}
        </section>
      )}

      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save receipt</SubmitButton>
        <LinkButton href="/vouchers/receipts" variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
