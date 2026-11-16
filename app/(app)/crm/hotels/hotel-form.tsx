'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { saveHotel } from '../masters-actions'

type Opt = { id: string; name: string }
export type HotelRow = Partial<Record<'id' | 'name' | 'city_id' | 'address' | 'contact_name' | 'phone' | 'mobile' | 'email' | 'supplier_ledger_id', string | null>> & { star_rating?: number | null }

export function HotelForm({ h, cities, suppliers }: { h: HotelRow; cities: Opt[]; suppliers: Opt[] }) {
  const [state, action] = useActionState(saveHotel, undefined)
  const v = (k: keyof HotelRow) => (h[k] ?? '') as string
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={v('id')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Hotel name" htmlFor="name" required className="sm:col-span-2"><Input id="name" name="name" defaultValue={v('name')} required /></Field>
        <Field label="City" htmlFor="city_id" hint="Missing a city? Ask to have it added.">
          <NativeSelect id="city_id" name="city_id" defaultValue={v('city_id')}>
            <option value="">—</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Star rating" htmlFor="star_rating">
          <NativeSelect id="star_rating" name="star_rating" defaultValue={h.star_rating ? String(h.star_rating) : ''}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5, 6, 7].map((s) => <option key={s} value={s}>{s} star</option>)}
          </NativeSelect>
        </Field>
        <Field label="Address" htmlFor="address" className="sm:col-span-2"><Input id="address" name="address" defaultValue={v('address')} /></Field>
        <Field label="Contact person" htmlFor="contact_name"><Input id="contact_name" name="contact_name" defaultValue={v('contact_name')} /></Field>
        <Field label="Mobile" htmlFor="mobile"><Input id="mobile" name="mobile" type="tel" defaultValue={v('mobile')} /></Field>
        <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={v('phone')} /></Field>
        <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={v('email')} /></Field>
        <Field label="Supplier account" htmlFor="supplier_ledger_id" className="sm:col-span-2" hint="Who you pay for this hotel">
          <NativeSelect id="supplier_ledger_id" name="supplier_ledger_id" defaultValue={v('supplier_ledger_id')}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save hotel</SubmitButton>
        <LinkButton href="/crm/hotels" variant="outline">Back</LinkButton>
      </div>
    </form>
  )
}
