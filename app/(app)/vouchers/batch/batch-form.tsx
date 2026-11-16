'use client'

import { useActionState, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { formatINR, toPaise } from '@/lib/money'
import { cn } from '@/lib/utils'
import { saveBatch } from './actions'

type Opt = { id: string; name: string }
type Row = { party_ledger_id: string; amount: string; reference: string; narration: string }
const blank = (): Row => ({ party_ledger_id: '', amount: '', reference: '', narration: '' })

export function BatchForm({ kind, parties, accounts, today }: { kind: 'receipt' | 'payment'; parties: Opt[]; accounts: Opt[]; today: string }) {
  const [state, action] = useActionState(saveBatch, undefined)
  const [date, setDate] = useState(today)
  const [account, setAccount] = useState(accounts[0]?.id ?? '')
  const [mode, setMode] = useState('bank_transfer')
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()])
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const total = rows.reduce((s, r) => s + toPaise(r.amount), 0)
  const done = new Map(state?.results?.map((r) => [r.row, r]))

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="payload" value={JSON.stringify({ kind, voucher_date: date, cash_bank_ledger_id: account, mode, rows })} />
      <section className="grid gap-4 rounded-3xl bg-card p-5 sm:grid-cols-3">
        <Field label="Date" htmlFor="date" required><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={kind === 'receipt' ? 'Deposited to' : 'Paid from'} htmlFor="account" required>
          <NativeSelect id="account" value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Mode" htmlFor="mode">
          <NativeSelect id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="card">Card</option>
          </NativeSelect>
        </Field>
      </section>

      <section className="grid gap-2 rounded-3xl bg-card p-5">
        <div className="hidden grid-cols-[32px_1.5fr_140px_1fr_1fr_32px] gap-2 text-xs text-muted-foreground lg:grid">
          <span>#</span><span>{kind === 'receipt' ? 'Received from' : 'Paid to'}</span><span className="text-right">Amount (₹)</span><span>Reference / UTR</span><span>Narration</span><span />
        </div>
        {rows.map((r, i) => {
          const res = done.get(i + 1)
          return (
            <div key={i} className={cn('grid grid-cols-2 gap-2 rounded-2xl p-1 lg:grid-cols-[32px_1.5fr_140px_1fr_1fr_32px] lg:items-center', res && (res.ok ? 'bg-primary/10' : 'bg-destructive/10'))}>
              <span className="hidden text-sm text-muted-foreground lg:block">{i + 1}</span>
              <NativeSelect aria-label={`Row ${i + 1} party`} className="col-span-2 lg:col-span-1" value={r.party_ledger_id} onChange={(e) => setRow(i, { party_ledger_id: e.target.value })}>
                <option value="">Choose party</option>
                {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </NativeSelect>
              <Input aria-label={`Row ${i + 1} amount`} inputMode="decimal" className="text-right tabular-nums" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} />
              <Input aria-label={`Row ${i + 1} reference`} value={r.reference} onChange={(e) => setRow(i, { reference: e.target.value })} />
              <Input aria-label={`Row ${i + 1} narration`} className="col-span-2 lg:col-span-1" value={r.narration} onChange={(e) => setRow(i, { narration: e.target.value })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${i + 1}`} disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 /></Button>
              {res && <p className={cn('col-span-2 text-xs lg:col-span-6', res.ok ? 'text-primary' : 'text-destructive')}>{res.ok ? `Saved as ${res.message}` : res.message}</p>}
            </div>
          )
        })}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blank()])}><Plus /> Add row</Button>
          <p className="text-sm text-muted-foreground">Total <span className="font-semibold text-foreground tabular-nums">{formatINR(total)}</span></p>
        </div>
      </section>

      <FormError state={state} />
      <p className="text-xs text-muted-foreground">Each row is saved as its own {kind} and kept on account. Match them to bills afterwards under Bill adjustment.</p>
      <div className="flex gap-2">
        <SubmitButton>Save all</SubmitButton>
        <LinkButton href={kind === 'receipt' ? '/vouchers/receipts' : '/vouchers/payments'} variant="outline">Back</LinkButton>
        {state?.results?.some((r) => r.ok) && <LinkButton href="/vouchers/adjust" variant="outline">Adjust against bills</LinkButton>}
      </div>
    </form>
  )
}
