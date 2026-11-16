'use client'

import { useActionState, useState } from 'react'
import { Input } from '@/components/ui/input'
import { FormError, SubmitButton } from '@/components/form'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import { saveOpeningBalances } from './actions'

type L = { id: string; name: string; group: string; amount: number }

export function OpeningForm({ ledgers, locked }: { ledgers: L[]; locked: boolean }) {
  const [state, action] = useActionState(saveOpeningBalances, undefined)
  const [vals, setVals] = useState<Record<string, { dr: string; cr: string }>>(
    Object.fromEntries(ledgers.map((l) => [l.id, { dr: l.amount > 0 ? paiseToInput(l.amount) : '', cr: l.amount < 0 ? paiseToInput(-l.amount) : '' }])),
  )
  const dr = Object.values(vals).reduce((s, v) => s + toPaise(v.dr), 0)
  const cr = Object.values(vals).reduce((s, v) => s + toPaise(v.cr), 0)

  return (
    <form action={action} className="grid gap-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr><th className="px-3 py-2 text-left font-medium">Account</th><th className="w-40 px-3 py-2 text-right font-medium">Debit (₹)</th><th className="w-40 px-3 py-2 text-right font-medium">Credit (₹)</th></tr>
          </thead>
          <tbody>
            {ledgers.map((l, i) => {
              const head = i === 0 || ledgers[i - 1].group !== l.group
              return [
                head && <tr key={`g-${l.group}`} className="bg-muted/40"><td colSpan={3} className="px-3 py-1.5 text-xs font-medium">{l.group}</td></tr>,
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{l.name}</td>
                  <td className="px-3 py-1"><Input name={`dr_${l.id}`} aria-label={`${l.name} debit`} inputMode="decimal" disabled={locked} className="text-right tabular-nums" value={vals[l.id].dr} onChange={(e) => setVals((v) => ({ ...v, [l.id]: { dr: e.target.value, cr: '' } }))} /></td>
                  <td className="px-3 py-1"><Input name={`cr_${l.id}`} aria-label={`${l.name} credit`} inputMode="decimal" disabled={locked} className="text-right tabular-nums" value={vals[l.id].cr} onChange={(e) => setVals((v) => ({ ...v, [l.id]: { cr: e.target.value, dr: '' } }))} /></td>
                </tr>,
              ]
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(dr)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(cr)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {dr !== cr && <p className="text-sm text-destructive">Debits and credits differ by {formatINR(Math.abs(dr - cr))}. Your balance sheet won’t balance until they match.</p>}
      <FormError state={state} />
      {state && 'saved' in state && state.saved && <p className="text-sm text-primary">Opening balances saved.</p>}
      {!locked && <div><SubmitButton>Save opening balances</SubmitButton></div>}
    </form>
  )
}
