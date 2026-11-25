'use client'

import { useActionState, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DateInput } from '@/components/date-input'
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
  followupDate,
}: {
  lead: LeadRow
  parties: { id: string; name: string }[]
  members: { id: string; display_name: string }[]
  /** Pre-filled date for the first follow-up of a new lead (YYYY-MM-DD). */
  followupDate?: string
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
  const total = pax.adults + pax.c12 + pax.c6 + pax.inf

  return (
    <form action={action} className="grid max-w-3xl gap-4">
      <input type="hidden" name="id" value={lead.id ?? ''} />
      {isNew && <input type="hidden" name="status" value={lead.status ?? 'initial'} />}

      <section className="grid gap-4 rounded-3xl bg-card p-5">
        <h2 className="text-sm font-medium">Customer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="guest_name" required>
            <Input id="guest_name" name="guest_name" defaultValue={lead.guest_name} required />
          </Field>
          <Field label="Phone" htmlFor="phone" required>
            <Input id="phone" name="phone" type="tel" defaultValue={lead.phone} required />
          </Field>
        </div>
        {!isNew && (
          <Field label="Stage" htmlFor="status" className="sm:max-w-60">
            <NativeSelect id="status" name="status" defaultValue={lead.status ?? 'initial'}>
              {LEAD_STATUSES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </NativeSelect>
          </Field>
        )}
      </section>

      <section className="grid gap-4 rounded-3xl bg-card p-5">
        <h2 className="text-sm font-medium">What do they want?</h2>
        <div className="flex flex-wrap gap-2">
          {LEAD_SERVICES.map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10">
              <input type="checkbox" name="services" value={v} defaultChecked={lead.services?.includes(v)} className="size-3.5" />
              {l}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Travelling from" htmlFor="start_place">
            <Input id="start_place" name="start_place" defaultValue={lead.start_place ?? ''} placeholder="e.g. Mumbai" />
          </Field>
          <Field label="Travel date" htmlFor="travel_date" hint="Leave empty if not decided yet">
            <DateInput id="travel_date" name="travel_date" defaultValue={lead.travel_date ?? ''} />
          </Field>
          <Field label="Adults" htmlFor="adults" hint={total > pax.adults ? `${total} people in all` : undefined}>
            <Input id="adults" name="adults" type="number" min={1} value={pax.adults} onChange={(e) => setPax({ ...pax, adults: +e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl bg-card p-5">
        <h2 className="text-sm font-medium">{isNew ? 'When to call them next?' : 'Add another follow-up'}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" htmlFor="followup_date" required={isNew} hint={isNew ? undefined : 'Leave empty if not needed'}>
            <DateInput id="followup_date" name="followup_date" defaultValue={isNew ? followupDate : undefined} required={isNew} />
          </Field>
          <Field label="Time" htmlFor="followup_slot">
            <NativeSelect id="followup_slot" name="followup_slot" defaultValue="09:00">
              {TIME_SLOTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="What to do" htmlFor="followup_action">
            <NativeSelect id="followup_action" name="followup_action" defaultValue="call">
              {FOLLOWUP_ACTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </section>

      {/* Everything below is optional. Fields inside a closed <details> are still submitted. */}
      <details className="group rounded-3xl bg-card p-5">
        <summary className="cursor-pointer text-sm font-medium">
          More details <span className="font-normal text-muted-foreground">(optional): children, budget, email, notes</span>
        </summary>
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Children above 12" htmlFor="children_above_12">
              <Input id="children_above_12" name="children_above_12" type="number" min={0} value={pax.c12} onChange={(e) => setPax({ ...pax, c12: +e.target.value })} />
            </Field>
            <Field label="Children 6–12" htmlFor="children_6_12">
              <Input id="children_6_12" name="children_6_12" type="number" min={0} value={pax.c6} onChange={(e) => setPax({ ...pax, c6: +e.target.value })} />
            </Field>
            <Field label="Infants" htmlFor="infants">
              <Input id="infants" name="infants" type="number" min={0} value={pax.inf} onChange={(e) => setPax({ ...pax, inf: +e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Budget (₹)" htmlFor="budget">
              <Input id="budget" name="budget" inputMode="decimal" defaultValue={paiseToInput(lead.budget)} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={lead.email ?? ''} />
            </Field>
            <Field label="How did they find us?" htmlFor="source">
              <NativeSelect id="source" name="source" defaultValue={lead.source ?? ''}>
                <option value="">—</option>
                {LEAD_SOURCES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Referred by" htmlFor="reference">
              <Input id="reference" name="reference" defaultValue={lead.reference ?? ''} />
            </Field>
            <Field label="Handled by" htmlFor="assigned_to">
              <NativeSelect id="assigned_to" name="assigned_to" defaultValue={lead.assigned_to ?? ''}>
                <option value="">{lead.id ? '—' : 'Me'}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Existing client" htmlFor="party_ledger_id">
              <NativeSelect id="party_ledger_id" name="party_ledger_id" defaultValue={lead.party_ledger_id ?? ''}>
                <option value="">— New client —</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Notes" htmlFor="remarks" hint={`${remarks.length}/250`}>
            <Textarea id="remarks" name="remarks" rows={2} maxLength={250} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>
      </details>

      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>{isNew ? 'Save lead' : 'Save changes'}</SubmitButton>
        <LinkButton href="/crm/leads" variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
