'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { saveHotelVoucher } from './actions'

type Opt = { id: string; name: string }
export type HotelVoucherDraft = Record<
  'id' | 'kind' | 'voucher_date' | 'party_ledger_id' | 'invoice_id' | 'hotel_id' | 'property_name' | 'guest_name' | 'other_guests' | 'adults' | 'children' |
  'check_in' | 'check_out' | 'rooms' | 'room_type' | 'meal_plan' | 'confirmation_no' | 'contact' | 'inclusions' | 'notes',
  string
>

export function HotelVoucherForm({ v, customers, hotels }: { v: HotelVoucherDraft; customers: Opt[]; hotels: (Opt & { contact: string })[] }) {
  const [state, action] = useActionState(saveHotelVoucher, undefined)
  return (
    <form action={action} className="grid max-w-4xl gap-4">
      <input type="hidden" name="id" value={v.id} />
      <input type="hidden" name="invoice_id" value={v.invoice_id} />
      <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Type" htmlFor="kind">
          <NativeSelect id="kind" name="kind" defaultValue={v.kind}><option value="hotel">Hotel</option><option value="cruise">Cruise</option></NativeSelect>
        </Field>
        <Field label="Voucher date" htmlFor="voucher_date" required><Input id="voucher_date" name="voucher_date" type="date" defaultValue={v.voucher_date} /></Field>
        <Field label="Client" htmlFor="party" className="sm:col-span-2">
          <NativeSelect id="party" name="party_ledger_id" defaultValue={v.party_ledger_id}>
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Hotel from masters" htmlFor="hotel_id" className="sm:col-span-2" hint="Optional; the name below is what prints">
          <NativeSelect id="hotel_id" name="hotel_id" defaultValue={v.hotel_id}
            onChange={(e) => {
              const h = hotels.find((x) => x.id === e.target.value)
              const f = e.currentTarget.form
              if (h && f) {
                ;(f.elements.namedItem('property_name') as HTMLInputElement).value = h.name
                if (h.contact) (f.elements.namedItem('contact') as HTMLInputElement).value = h.contact
              }
            }}>
            <option value="">—</option>
            {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Hotel / cruise name" htmlFor="property_name" required className="sm:col-span-2"><Input id="property_name" name="property_name" defaultValue={v.property_name} required /></Field>
        <Field label="Lead guest" htmlFor="guest_name" required className="sm:col-span-2"><Input id="guest_name" name="guest_name" className="uppercase" defaultValue={v.guest_name} required /></Field>
        <Field label="Other guests (one per line)" htmlFor="other_guests" className="sm:col-span-2"><Textarea id="other_guests" name="other_guests" rows={2} className="uppercase" defaultValue={v.other_guests} /></Field>
        <Field label="Adults" htmlFor="adults"><Input id="adults" name="adults" type="number" min={1} defaultValue={v.adults} /></Field>
        <Field label="Children" htmlFor="children"><Input id="children" name="children" type="number" min={0} defaultValue={v.children} /></Field>
        <Field label="Check-in" htmlFor="check_in" required><Input id="check_in" name="check_in" type="date" defaultValue={v.check_in} required /></Field>
        <Field label="Check-out" htmlFor="check_out" required><Input id="check_out" name="check_out" type="date" defaultValue={v.check_out} required /></Field>
        <Field label="Rooms / cabins" htmlFor="rooms"><Input id="rooms" name="rooms" type="number" min={1} defaultValue={v.rooms} /></Field>
        <Field label="Room / cabin type" htmlFor="room_type"><Input id="room_type" name="room_type" defaultValue={v.room_type} /></Field>
        <Field label="Meal plan" htmlFor="meal_plan"><Input id="meal_plan" name="meal_plan" defaultValue={v.meal_plan} /></Field>
        <Field label="Confirmation no." htmlFor="confirmation_no"><Input id="confirmation_no" name="confirmation_no" defaultValue={v.confirmation_no} /></Field>
        <Field label="Hotel contact" htmlFor="contact" className="sm:col-span-2"><Input id="contact" name="contact" defaultValue={v.contact} /></Field>
        <Field label="Inclusions" htmlFor="inclusions" className="sm:col-span-2"><Textarea id="inclusions" name="inclusions" rows={2} defaultValue={v.inclusions} /></Field>
        <Field label="Notes for the hotel" htmlFor="notes" className="sm:col-span-2"><Textarea id="notes" name="notes" rows={2} defaultValue={v.notes} /></Field>
      </section>
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save voucher</SubmitButton>
        <LinkButton href={v.id ? `/billing/hotel-vouchers/${v.id}` : '/billing/hotel-vouchers'} variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
