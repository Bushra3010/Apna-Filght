'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { savePassenger } from './actions'

export type PassengerRow = Partial<Record<'id' | 'title' | 'first_name' | 'last_name' | 'dob' | 'gender' | 'mobile' | 'email' | 'party_ledger_id' | 'passport_no' | 'passport_expiry' | 'address' | 'remark', string | null>>

export function PassengerForm({ p, parties }: { p: PassengerRow; parties: { id: string; name: string }[] }) {
  const [state, action] = useActionState(savePassenger, undefined)
  const v = (k: keyof PassengerRow) => p[k] ?? ''
  return (
    <form action={action} className="grid max-w-3xl gap-4">
      <input type="hidden" name="id" value={v('id')} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Title" htmlFor="title">
          <NativeSelect id="title" name="title" defaultValue={v('title')}>
            <option value="">—</option>
            {['MR', 'MRS', 'MS', 'MSTR', 'MISS', 'DR'].map((t) => <option key={t} value={t}>{t}</option>)}
          </NativeSelect>
        </Field>
        <Field label="First name" htmlFor="first_name" required className="sm:col-span-2">
          <Input id="first_name" name="first_name" className="uppercase" defaultValue={v('first_name')} required />
        </Field>
        <Field label="Last name" htmlFor="last_name">
          <Input id="last_name" name="last_name" className="uppercase" defaultValue={v('last_name')} />
        </Field>
        <Field label="Date of birth" htmlFor="dob">
          <Input id="dob" name="dob" type="date" defaultValue={v('dob')} />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <NativeSelect id="gender" name="gender" defaultValue={v('gender')}>
            <option value="">—</option><option value="M">Male</option><option value="F">Female</option><option value="X">Other</option>
          </NativeSelect>
        </Field>
        <Field label="Mobile" htmlFor="mobile">
          <Input id="mobile" name="mobile" type="tel" defaultValue={v('mobile')} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={v('email')} />
        </Field>
        <Field label="Passport no." htmlFor="passport_no">
          <Input id="passport_no" name="passport_no" className="uppercase" defaultValue={v('passport_no')} />
        </Field>
        <Field label="Passport expiry" htmlFor="passport_expiry">
          <Input id="passport_expiry" name="passport_expiry" type="date" defaultValue={v('passport_expiry')} />
        </Field>
        <Field label="Client / group" htmlFor="party_ledger_id" className="sm:col-span-2">
          <NativeSelect id="party_ledger_id" name="party_ledger_id" defaultValue={v('party_ledger_id')}>
            <option value="">—</option>
            {parties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Address" htmlFor="address"><Textarea id="address" name="address" rows={2} defaultValue={v('address')} /></Field>
      <Field label="Remark" htmlFor="remark"><Input id="remark" name="remark" defaultValue={v('remark')} /></Field>
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save passenger</SubmitButton>
        <LinkButton href="/masters/passengers" variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
