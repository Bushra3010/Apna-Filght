'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { createCompany } from './actions'

export function CompanyForm({ states, fyStart }: { states: { gst_code: string; name: string }[]; fyStart: string }) {
  const [state, action] = useActionState(createCompany, undefined)
  return (
    <form action={action} className="grid gap-4">
      <Field label="Company name" htmlFor="name" required>
        <Input id="name" name="name" placeholder="Apna Flight Travels" required />
      </Field>
      <Field label="State" htmlFor="state" required hint="Decides CGST + SGST vs IGST on your invoices">
        <NativeSelect id="state" name="state" required defaultValue="">
          <option value="" disabled>Select state</option>
          {states.map((s) => (
            <option key={s.gst_code} value={s.gst_code}>
              {s.gst_code} – {s.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Financial year starts" htmlFor="fy_start" required>
        <Input id="fy_start" name="fy_start" type="date" defaultValue={fyStart} required />
      </Field>
      <FormError state={state} />
      <SubmitButton className="w-full">Create company</SubmitButton>
    </form>
  )
}
