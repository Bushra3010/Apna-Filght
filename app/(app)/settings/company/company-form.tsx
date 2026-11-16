'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { saveCompany } from './actions'

type Org = Record<string, string | null>

export function CompanySettingsForm({ org, states }: { org: Org; states: { id: string; name: string; gst_code: string }[] }) {
  const [state, action] = useActionState(saveCompany, undefined)
  const v = (k: string) => org[k] ?? ''
  return (
    <form action={action} className="grid max-w-3xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={v('name')} required />
        </Field>
        <Field label="Legal name (on invoices)" htmlFor="legal_name">
          <Input id="legal_name" name="legal_name" defaultValue={v('legal_name')} />
        </Field>
        <Field label="Address line 1" htmlFor="address_line1">
          <Input id="address_line1" name="address_line1" defaultValue={v('address_line1')} />
        </Field>
        <Field label="Address line 2" htmlFor="address_line2">
          <Input id="address_line2" name="address_line2" defaultValue={v('address_line2')} />
        </Field>
        <Field label="State" htmlFor="state_id" required>
          <NativeSelect id="state_id" name="state_id" defaultValue={v('state_id')} required>
            {states.map((s) => (
              <option key={s.id} value={s.id}>{s.gst_code} – {s.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="PIN code" htmlFor="pincode">
          <Input id="pincode" name="pincode" inputMode="numeric" maxLength={6} defaultValue={v('pincode')} />
        </Field>
        <Field label="GSTIN" htmlFor="gstin">
          <Input id="gstin" name="gstin" maxLength={15} className="uppercase" defaultValue={v('gstin')} />
        </Field>
        <Field label="PAN" htmlFor="pan">
          <Input id="pan" name="pan" maxLength={10} className="uppercase" defaultValue={v('pan')} />
        </Field>
        <Field label="Mobile" htmlFor="mobile">
          <Input id="mobile" name="mobile" type="tel" defaultValue={v('mobile')} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={v('phone')} />
        </Field>
        <Field label="Email" htmlFor="email" className="sm:col-span-2">
          <Input id="email" name="email" type="email" defaultValue={v('email')} />
        </Field>
      </div>
      <Field label="Invoice terms & conditions" htmlFor="invoice_terms" hint="Printed at the bottom of every invoice">
        <Textarea id="invoice_terms" name="invoice_terms" rows={4} defaultValue={v('invoice_terms')} />
      </Field>
      <FormError state={state} />
      {state && 'saved' in state && state.saved && <p className="text-sm text-primary">Saved.</p>}
      <div>
        <SubmitButton>Save company</SubmitButton>
      </div>
    </form>
  )
}
