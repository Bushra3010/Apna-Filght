'use client'

import { useActionState, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { FOLLOWUP_ACTIONS, LEAD_SERVICES, LEAD_SOURCES, LEAD_STATUSES, TIME_SLOTS } from '@/lib/leads'
import { paiseToInput } from '@/lib/money'
import { saveLead } from './actions'

export type LeadRow = {
  id?: string
  guest_name?: string
  phone?: string
  email?: string | null
  party_ledger_id?: string | null
  start_place?: string | null
  travel_date?: string | null
  travel_date_open?: boolean
  services?: string[]
  adults?: number
  children_above_12?: number
  children_6_12?: number
  infants?: number
  source?: string | null
  reference?: string | null
  budget?: number | null
  remarks?: string | null
  status?: string
  assigned_to?: string | null
}

export function LeadForm({
  lead,
  parties,
  members,
}: {
  lead: LeadRow
  parties: { id: string; name: string }[]
  members: { id: string; display_name: string }[]
}) {
  const [state, action] = useActionState(saveLead, undefined)
  const [pax, setPax] = useState({
    adults: lead.adults ?? 1,
    c12: lead.children_above_12 ?? 0,
    c6: lead.children_6_12 ?? 0,
    inf: lead.infants ?? 0,
  })
  const [remarks, setRemarks] = useState(lead.remarks ?? '')
  const isNew = !lead.id

  return (
    <form action={action} className="grid max-w-4xl gap-6">
      <input type="hidden" name="id" value={lead.id ?? ''} />

      <section className="grid gap-4 rounded-3xl bg-card p-5">
        <h2 className="text-sm font-medium">Guest & contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guest name" htmlFor="guest_name" required>
            <Input id="guest_name" name="guest_name" defaultValue={lead.guest_name} required />
          </Field>
          <Field label="Phone" htmlFor="phone" required>
            <Input id="phone" name="phone" type="tel" defaultValue={lead.phone} required />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={lead.email ?? ''} />
          </Field>
          <Field label="Client account" htmlFor="party_ledger_id" hint="Optional: link to an existing client ledger">
            <NativeSelect id="party_ledger_id" name="party_ledger_id" defaultValue={lead.party_ledger_id ?? ''}>
              <option value="">— Walk-in / new client —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl bg-card p-5">
        <h2 className="text-sm font-medium">Travel requirements</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starting from" htmlFor="start_place">
            <Input id="start_place" name="start_place" defaultValue={lead.start_place ?? ''} placeholder="e.g. Mumbai" />
          </Field>
          <Field label="Expected travel date" htmlFor="travel_date">
            <Input id="travel_date" name="travel_date" type="date" defaultValue={lead.travel_date ?? ''} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
            <input type="checkbox" name="travel_date_open" defaultChecked={lead.travel_date_open} className="size-4" />
            Date is open
          </label>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Services interested in</legend>
          <div className="flex flex-wrap gap-2">
            {LEAD_SERVICES.map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10">
                <input type="checkbox" name="services" value={v} defaultChecked={lead.services?.includes(v)} className="size-3.5" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Field label="Adults" htmlFor="adults" required>
            <Input id="adults" name="adults" type="number" min={1} value={pax.adults} onChange={(e) => setPax({ ...pax, adults: +e.target.value })} />
          </Field>
          <Field label="Child > 12" htmlFor="children_above_12">
            <Input id="children_above_12" name="children_above_12" type="number" min={0} value={pax.c12} onChange={(e) => setPax({ ...pax, c12: +e.target.value })} />
          </Field>
          <Field label="Child 6–12" htmlFor="children_6_12">
            <Input id="children_6_12" name="children_6_12" type="number" min={0} value={pax.c6} onChange={(e) => setPax({ ...pax, c6: +e.target.value })} />
          </Field>
          <Field label="Infant" htmlFor="infants">
            <Input id="infants" name="infants" type="number" min={0} value={pax.inf} onChange={(e) => setPax({ ...pax, inf: +e.target.value })} />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Total pax</span>
            <span className="flex h-8 items-center text-sm tabular-nums">{pax.adults + pax.c12 + pax.c6 + pax.inf}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl bg-card p-5">
        <h2 className="text-sm font-medium">Enquiry</h2>
        <div className="grid gap-4 sm:grid-cols-5">
          <Field label="Assigned to" htmlFor="assigned_to">
            <NativeSelect id="assigned_to" name="assigned_to" defaultValue={lead.assigned_to ?? ''}>
              <option value="">{lead.id ? '—' : 'Me'}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Source" htmlFor="source">
            <NativeSelect id="source" name="source" defaultValue={lead.source ?? ''}>
              <option value="">—</option>
              {LEAD_SOURCES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Reference" htmlFor="reference">
            <Input id="reference" name="reference" defaultValue={lead.reference ?? ''} />
          </Field>
          <Field label="Budget (₹)" htmlFor="budget">
            <Input id="budget" name="budget" inputMode="decimal" defaultValue={paiseToInput(lead.budget)} />
          </Field>
          <Field label="Status" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue={lead.status ?? 'initial'}>
              {LEAD_STATUSES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Remarks / special requirements" htmlFor="remarks" hint={`${remarks.length}/250`}>
          <Textarea id="remarks" name="remarks" rows={2} maxLength={250} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </section>

      <section className="grid gap-4 rounded-3xl bg-card p-5">
        <h2 className="text-sm font-medium">
          {isNew ? 'Next follow-up' : 'Schedule another follow-up'}
          {isNew && <span className="text-destructive">*</span>}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Action" htmlFor="followup_action">
            <NativeSelect id="followup_action" name="followup_action" defaultValue="call">
              {FOLLOWUP_ACTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date" htmlFor="followup_date">
            <Input id="followup_date" name="followup_date" type="date" required={isNew} />
          </Field>
          <Field label="Time" htmlFor="followup_slot">
            <NativeSelect id="followup_slot" name="followup_slot" defaultValue="09:00">
              {TIME_SLOTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </section>

      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>{isNew ? 'Save lead' : 'Save changes'}</SubmitButton>
        <LinkButton href="/crm/leads" variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
