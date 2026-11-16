'use client'

import { useActionState, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import { saveVoucher } from './actions'
import type { LedgerOpt } from './data'

const KIND_LABEL: Record<string, string> = {
  supplier: 'Suppliers', customer: 'Clients', expense: 'Expenses', income: 'Income', capital: 'Capital',
  tax: 'Tax', other: 'Other', bank: 'Bank', cash: 'Cash',
}

function LedgerSelect({
  id,
  ledgers,
  value,
  onChange,
  placeholder = 'Select account',
}: {
  id: string
  ledgers: LedgerOpt[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const groups = Object.entries(
    ledgers.reduce<Record<string, LedgerOpt[]>>((g, l) => ((g[l.kind] ??= []).push(l), g), {}),
  )
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map(([kind, ls]) => (
        <optgroup key={kind} label={KIND_LABEL[kind] ?? kind}>
          {ls.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  )
}

type Common = { voucher_date: string; mode: string; cheque_no: string; cheque_date: string; cheque_bank: string; reference: string; narration: string }

function ModeFields({ v, set }: { v: Common; set: (k: keyof Common, val: string) => void }) {
  return (
    <>
      <Field label="Mode" htmlFor="mode">
        <NativeSelect id="mode" value={v.mode} onChange={(e) => set('mode', e.target.value)}>
          <option value="bank_transfer">Bank transfer (NEFT/IMPS/RTGS)</option>
          <option value="upi">UPI</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
          <option value="card">Card</option>
        </NativeSelect>
      </Field>
      <Field label="Reference / UTR" htmlFor="reference">
        <Input id="reference" value={v.reference} onChange={(e) => set('reference', e.target.value)} />
      </Field>
      {v.mode === 'cheque' && (
        <>
          <Field label="Cheque no." htmlFor="cheque_no" required>
            <Input id="cheque_no" value={v.cheque_no} onChange={(e) => set('cheque_no', e.target.value)} />
          </Field>
          <Field label="Cheque date" htmlFor="cheque_date">
            <Input id="cheque_date" type="date" value={v.cheque_date} onChange={(e) => set('cheque_date', e.target.value)} />
          </Field>
          <Field label="Bank" htmlFor="cheque_bank">
            <Input id="cheque_bank" value={v.cheque_bank} onChange={(e) => set('cheque_bank', e.target.value)} />
          </Field>
        </>
      )}
    </>
  )
}

const common = (today: string): Common => ({
  voucher_date: today, mode: 'bank_transfer', cheque_no: '', cheque_date: '', cheque_bank: '', reference: '', narration: '',
})

// ---------------------------------------------------------------------------
export type OpenDoc = { id: string; no: string; date: string; party: string; due: number; type: 'refund' | 'bill' }

export function PaymentForm({
  ledgers,
  open,
  initialParty,
  initialDoc,
  today,
}: {
  ledgers: LedgerOpt[]
  open: OpenDoc[]
  initialParty: string
  initialDoc: string
  today: string
}) {
  const [state, action] = useActionState(saveVoucher, undefined)
  const accounts = ledgers.filter((l) => l.kind === 'bank' || l.kind === 'cash')
  const payees = ledgers.filter((l) => l.kind !== 'bank' && l.kind !== 'cash')
  const preset = open.find((o) => o.id === initialDoc)
  const [v, setV] = useState({
    ...common(today),
    party_ledger_id: initialParty,
    cash_bank_ledger_id: accounts.find((a) => a.kind === 'bank')?.id ?? accounts[0]?.id ?? '',
    amount: preset ? paiseToInput(preset.due) : '',
  })
  const [alloc, setAlloc] = useState<Record<string, string>>(preset ? { [preset.id]: paiseToInput(preset.due) } : {})
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }))
  const docs = open.filter((o) => o.party === v.party_ledger_id)
  const allocated = docs.reduce((s, d) => s + toPaise(alloc[d.id] ?? ''), 0)
  const amount = toPaise(v.amount)

  const payload = {
    kind: 'payment',
    ...v,
    allocations: docs.map((d) => ({
      [d.type === 'refund' ? 'invoice_id' : 'purchase_bill_id']: d.id,
      amount: alloc[d.id] ?? '',
    })),
  }

  return (
    <form action={action} className="grid max-w-4xl gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Paid to" htmlFor="party" required>
          <LedgerSelect id="party" ledgers={payees} value={v.party_ledger_id} onChange={(x) => { set('party_ledger_id', x); setAlloc({}) }} />
        </Field>
        <Field label="Paid from" htmlFor="account" required>
          <LedgerSelect id="account" ledgers={accounts} value={v.cash_bank_ledger_id} onChange={(x) => set('cash_bank_ledger_id', x)} />
        </Field>
        <Field label="Date" htmlFor="date" required>
          <Input id="date" type="date" value={v.voucher_date} onChange={(e) => set('voucher_date', e.target.value)} />
        </Field>
        <Field label="Amount (₹)" htmlFor="amount" required>
          <Input id="amount" inputMode="decimal" className="text-right tabular-nums" value={v.amount} onChange={(e) => set('amount', e.target.value)} />
        </Field>
        <ModeFields v={v} set={set} />
        <Field label="Narration" htmlFor="narration" className="sm:col-span-2 lg:col-span-3">
          <Input id="narration" value={v.narration} onChange={(e) => set('narration', e.target.value)} />
        </Field>
      </section>

      {docs.length > 0 && (
        <section className="grid gap-2 rounded-xl border p-4">
          <h2 className="text-sm font-medium">Adjust against</h2>
          {docs.map((d) => (
            <div key={d.id} className="grid grid-cols-[1fr_auto_140px] items-center gap-3 text-sm">
              <span>
                {d.type === 'refund' ? 'Refund on ' : 'Bill '}
                {d.no} <span className="text-muted-foreground">· {new Date(d.date).toLocaleDateString('en-IN')}</span>
              </span>
              <span className="text-muted-foreground tabular-nums">due {formatINR(d.due)}</span>
              <Input
                aria-label={`Amount against ${d.no}`}
                inputMode="decimal"
                className="text-right tabular-nums"
                value={alloc[d.id] ?? ''}
                onChange={(e) => setAlloc((a) => ({ ...a, [d.id]: e.target.value }))}
              />
            </div>
          ))}
          <p className={allocated > amount ? 'text-right text-sm text-destructive' : 'text-right text-sm text-muted-foreground'}>
            Adjusted {formatINR(allocated)} of {formatINR(amount)}
          </p>
        </section>
      )}

      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save payment</SubmitButton>
        <LinkButton href="/vouchers/payments" variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
export function ContraForm({ ledgers, today }: { ledgers: LedgerOpt[]; today: string }) {
  const [state, action] = useActionState(saveVoucher, undefined)
  const accounts = ledgers.filter((l) => l.kind === 'bank' || l.kind === 'cash')
  const [v, setV] = useState({ ...common(today), cash_bank_ledger_id: '', party_ledger_id: '', amount: '' })
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }))
  return (
    <form action={action} className="grid max-w-3xl gap-6">
      <input type="hidden" name="payload" value={JSON.stringify({ kind: 'contra', ...v })} />
      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
        <Field label="From" htmlFor="from" required hint="e.g. cash deposited into bank: From = Cash">
          <LedgerSelect id="from" ledgers={accounts} value={v.cash_bank_ledger_id} onChange={(x) => set('cash_bank_ledger_id', x)} />
        </Field>
        <Field label="To" htmlFor="to" required>
          <LedgerSelect id="to" ledgers={accounts} value={v.party_ledger_id} onChange={(x) => set('party_ledger_id', x)} />
        </Field>
        <Field label="Date" htmlFor="date" required>
          <Input id="date" type="date" value={v.voucher_date} onChange={(e) => set('voucher_date', e.target.value)} />
        </Field>
        <Field label="Amount (₹)" htmlFor="amount" required>
          <Input id="amount" inputMode="decimal" className="text-right tabular-nums" value={v.amount} onChange={(e) => set('amount', e.target.value)} />
        </Field>
        <ModeFields v={v} set={set} />
        <Field label="Narration" htmlFor="narration" className="sm:col-span-2">
          <Input id="narration" value={v.narration} onChange={(e) => set('narration', e.target.value)} />
        </Field>
      </section>
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save contra</SubmitButton>
        <LinkButton href="/vouchers/contra" variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
type JLine = { ledger_id: string; debit: string; credit: string; narration: string }
const blank = (): JLine => ({ ledger_id: '', debit: '', credit: '', narration: '' })

export function JournalForm({ ledgers, today }: { ledgers: LedgerOpt[]; today: string }) {
  const [state, action] = useActionState(saveVoucher, undefined)
  const [date, setDate] = useState(today)
  const [narration, setNarration] = useState('')
  const [lines, setLines] = useState<JLine[]>([blank(), blank()])
  const setLine = (i: number, patch: Partial<JLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const dr = lines.reduce((s, l) => s + toPaise(l.debit), 0)
  const cr = lines.reduce((s, l) => s + toPaise(l.credit), 0)

  return (
    <form action={action} className="grid max-w-4xl gap-6">
      <input type="hidden" name="payload" value={JSON.stringify({ kind: 'journal', voucher_date: date, narration, lines })} />
      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[200px_1fr]">
        <Field label="Date" htmlFor="date" required>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Narration" htmlFor="narration">
          <Input id="narration" value={narration} onChange={(e) => setNarration(e.target.value)} />
        </Field>
      </section>
      <section className="grid gap-2 rounded-xl border p-4">
        <div className="hidden grid-cols-[1fr_130px_130px_1fr_32px] gap-2 text-xs font-medium text-muted-foreground sm:grid">
          <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span>Line note</span><span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_130px_130px_1fr_32px]">
            <div className="col-span-2 sm:col-span-1">
              <LedgerSelect id={`l-${i}`} ledgers={ledgers} value={l.ledger_id} onChange={(x) => setLine(i, { ledger_id: x })} />
            </div>
            <Input aria-label={`Debit line ${i + 1}`} inputMode="decimal" className="text-right tabular-nums" value={l.debit}
              onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} placeholder="Dr" />
            <Input aria-label={`Credit line ${i + 1}`} inputMode="decimal" className="text-right tabular-nums" value={l.credit}
              onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} placeholder="Cr" />
            <Input aria-label={`Note line ${i + 1}`} className="col-span-2 sm:col-span-1" value={l.narration} onChange={(e) => setLine(i, { narration: e.target.value })} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
            <Plus /> Add line
          </Button>
          <p className={dr === cr ? 'text-sm tabular-nums text-muted-foreground' : 'text-sm tabular-nums text-destructive'}>
            Dr {formatINR(dr)} · Cr {formatINR(cr)}{dr !== cr && ` · difference ${formatINR(Math.abs(dr - cr))}`}
          </p>
        </div>
      </section>
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save journal</SubmitButton>
        <LinkButton href="/vouchers/journal" variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
