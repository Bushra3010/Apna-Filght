'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { saveGroupPurchase } from './actions'

type Opt = { id: string; name: string }

export function GroupForm({ suppliers, airlines, states, orgStateId, today }: { suppliers: (Opt & { state_id: string | null })[]; airlines: { id: string; code: string; name: string }[]; states: { id: string; name: string; gst_code: string }[]; orgStateId: string | null; today: string }) {
  const [state, action] = useActionState(saveGroupPurchase, undefined)
  return (
    <form action={action} className="grid max-w-4xl gap-6">
      <section className="grid gap-4 rounded-3xl bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Supplier" htmlFor="supplier" required className="sm:col-span-2">
          <NativeSelect id="supplier" name="supplier_ledger_id" defaultValue="" required>
            <option value="" disabled>Select supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Purchase date" htmlFor="bill_date" required><Input id="bill_date" name="bill_date" type="date" defaultValue={today} /></Field>
        <Field label="Type" htmlFor="bill_type">
          <NativeSelect id="bill_type" name="bill_type" defaultValue="domestic"><option value="domestic">Domestic</option><option value="international">International</option></NativeSelect>
        </Field>
        <Field label="Airline" htmlFor="airline_id">
          <NativeSelect id="airline_id" name="airline_id" defaultValue=""><option value="">—</option>{airlines.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}</NativeSelect>
        </Field>
        <Field label="Flight no." htmlFor="flight_no"><Input id="flight_no" name="flight_no" className="uppercase" /></Field>
        <Field label="Sector" htmlFor="sector"><Input id="sector" name="sector" className="uppercase" placeholder="DEL-GOI-DEL" /></Field>
        <Field label="Group PNR" htmlFor="pnr"><Input id="pnr" name="pnr" className="uppercase" /></Field>
        <Field label="Travel date" htmlFor="travel_date" required><Input id="travel_date" name="travel_date" type="date" required /></Field>
        <Field label="Seats" htmlFor="seats" required><Input id="seats" name="seats" type="number" min={1} required /></Field>
        <Field label="Total cost (₹)" htmlFor="amount" required hint="For all seats, including any GST"><Input id="amount" name="amount" inputMode="decimal" className="text-right" required /></Field>
        <Field label="of which GST (₹)" htmlFor="gst" hint="Input credit, if any"><Input id="gst" name="gst" inputMode="decimal" className="text-right" /></Field>
        <Field label="Supplier's bill no." htmlFor="supplier_bill_no"><Input id="supplier_bill_no" name="supplier_bill_no" /></Field>
        <Field label="Supplier's bill date" htmlFor="supplier_bill_date"><Input id="supplier_bill_date" name="supplier_bill_date" type="date" /></Field>
        <Field label="Place of supply" htmlFor="pos">
          <NativeSelect id="pos" name="place_of_supply_state_id" defaultValue={orgStateId ?? ''}>{states.map((s) => <option key={s.id} value={s.id}>{s.gst_code} – {s.name}</option>)}</NativeSelect>
        </Field>
        <Field label="TDS deducted (₹)" htmlFor="tds"><Input id="tds" name="tds" inputMode="decimal" className="text-right" /></Field>
        <Field label="Notes" htmlFor="notes" className="sm:col-span-2 lg:col-span-4"><Textarea id="notes" name="notes" rows={2} /></Field>
      </section>
      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save group purchase</SubmitButton>
        <LinkButton href="/purchase/groups" variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
