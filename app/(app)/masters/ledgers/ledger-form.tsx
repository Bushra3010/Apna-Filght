'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { saveLedger } from './actions'
import { LEDGER_KINDS } from '@/lib/ledgers'

export type LedgerRow = {
  id?: string
  name?: string
  kind?: string
  gstin?: string | null
  pan?: string | null
  state_id?: string | null
  address?: string | null
  contact_person?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  credit_days?: number
}


export function LedgerForm({
  ledger,
  states,
  returnTo,
}: {
  ledger: LedgerRow
  states: { id: string; name: string; gst_code: string }[]
  returnTo?: string
}) {
  const [state, action] = useActionState(saveLedger, undefined)
  return (
    <form action={action} className="grid max-w-3xl gap-4">
      <input type="hidden" name="id" value={ledger.id ?? ''} />
      <input type="hidden" name="return_to" value={returnTo ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={ledger.name} required />
        </Field>
        <Field label="Type" htmlFor="kind" required>
          <NativeSelect id="kind" name="kind" defaultValue={ledger.kind ?? 'customer'}>
            {LEDGER_KINDS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="GSTIN" htmlFor="gstin">
          <Input id="gstin" name="gstin" defaultValue={ledger.gstin ?? ''} maxLength={15} className="uppercase" />
        </Field>
        <Field label="PAN" htmlFor="pan">
          <Input id="pan" name="pan" defaultValue={ledger.pan ?? ''} maxLength={10} className="uppercase" />
        </Field>
        <Field label="State" htmlFor="state_id" hint="Default place of supply on invoices">
          <NativeSelect id="state_id" name="state_id" defaultValue={ledger.state_id ?? ''}>
            <option value="">—</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>{s.gst_code} – {s.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Credit days" htmlFor="credit_days">
          <Input id="credit_days" name="credit_days" type="number" min={0} max={365} defaultValue={ledger.credit_days ?? 0} />
        </Field>
        <Field label="Contact person" htmlFor="contact_person">
          <Input id="contact_person" name="contact_person" defaultValue={ledger.contact_person ?? ''} />
        </Field>
        <Field label="Mobile" htmlFor="mobile">
          <Input id="mobile" name="mobile" type="tel" defaultValue={ledger.mobile ?? ''} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={ledger.phone ?? ''} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={ledger.email ?? ''} />
        </Field>
      </div>
      <Field label="Address" htmlFor="address">
        <Textarea id="address" name="address" rows={2} defaultValue={ledger.address ?? ''} />
      </Field>
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save ledger</SubmitButton>
        <LinkButton href={returnTo || '/masters/ledgers'} variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
