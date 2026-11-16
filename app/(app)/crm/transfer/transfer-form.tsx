'use client'

import { useActionState } from 'react'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LEAD_STATUSES } from '@/lib/leads'
import { transferLeads } from './actions'

export function TransferForm({ members }: { members: { id: string; name: string; active: boolean }[] }) {
  const [state, action] = useActionState(transferLeads, undefined)
  const open = ['initial', 'active', 'proposal', 'negotiation', 'pipeline']
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Move leads from" htmlFor="from">
          <NativeSelect id="from" name="from" defaultValue="">
            <option value="" disabled>Choose person</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{!m.active && ' (inactive)'}</option>)}
          </NativeSelect>
        </Field>
        <Field label="To" htmlFor="to">
          <NativeSelect id="to" name="to" defaultValue="">
            <option value="" disabled>Choose person</option>
            {members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Statuses to move</legend>
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10">
              <input type="checkbox" name="status" value={v} defaultChecked={open.includes(v)} className="size-3.5" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <FormError state={state} />
      {state?.moved !== undefined && <p className="rounded-2xl bg-primary/10 px-4 py-2.5 text-sm text-primary">Moved {state.moved} lead{state.moved === 1 ? '' : 's'}.</p>}
      <div><SubmitButton>Transfer leads</SubmitButton></div>
    </form>
  )
}
