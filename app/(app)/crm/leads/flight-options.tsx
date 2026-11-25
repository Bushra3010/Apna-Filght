'use client'

import { useState, useTransition } from 'react'
import { Plane, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/form'
import { AirportPicker } from '@/components/airport-picker'
import { DateInput } from '@/components/date-input'
import { WhatsAppButton } from '@/components/whatsapp-button'
import { airportCity, flightOptionsMessage, type Flight } from '@/lib/flights'
import { paiseToInput } from '@/lib/money'
import { addFlightOptions, findFlights, removeFlightOption, setFlightOptionPrice } from './flight-actions'

export type SavedOption = Flight & { id: string; price: number | null }

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const times = (f: Flight) => [f.depart_time, f.arrive_time].filter(Boolean).join(' → ') || 'Time not known'

/** Find the flights on a route, keep a few with your own rate, send them to the customer. */
export function FlightOptions({
  leadId, guest, phone, company, saved, from: from0, date: date0,
}: {
  leadId: string
  guest: string
  phone: string | null
  company: string
  saved: SavedOption[]
  from: string | null
  date: string | null
}) {
  const [from, setFrom] = useState(from0 ?? '')
  const [to, setTo] = useState('')
  const [date, setDate] = useState(date0 ?? '')
  const [found, setFound] = useState<Flight[] | null>(null)
  const [picked, setPicked] = useState<Record<string, string | undefined>>({}) // flight no -> rate typed
  const [manual, setManual] = useState({ airline: '', flight_no: '', depart_time: '', arrive_time: '', price: '' })
  const [error, setError] = useState<string>()
  const [busy, start] = useTransition()

  const search = () =>
    start(async () => {
      setError(undefined)
      setFound(null)
      setPicked({})
      const r = await findFlights(from, to, date)
      if (r.error) setError(r.error)
      else setFound(r.flights ?? [])
    })

  const save = (options: (Flight & { price: string })[], done: () => void) =>
    start(async () => {
      setError(undefined)
      const r = await addFlightOptions(leadId, options)
      if (r.error) setError(r.error)
      else done()
    })

  const chosen = (found ?? []).filter((f) => picked[f.flight_no] !== undefined)

  return (
    <section className="mb-6 grid gap-4 rounded-3xl bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium"><Plane className="size-4 text-primary" /> Flight options</h2>
        {saved.length > 0 && (
          <WhatsAppButton phone={phone} text={flightOptionsMessage(guest, company, saved)} label="Send options on WhatsApp" size="sm" />
        )}
      </div>

      {saved.length > 0 && (
        <ul className="grid gap-2">
          {saved.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
              <div className="min-w-40 flex-1">
                <div className="font-medium">{o.airline} · {o.flight_no}</div>
                <div className="text-xs text-muted-foreground">
                  {airportCity(o.from_code)} → {airportCity(o.to_code)} · {day(o.travel_date)} · {times(o)}
                </div>
              </div>
              <form action={setFlightOptionPrice} className="flex items-center gap-2">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="lead_id" value={leadId} />
                <span className="text-muted-foreground">₹</span>
                <Input name="price" inputMode="decimal" defaultValue={paiseToInput(o.price)} placeholder="Your rate" aria-label={`Rate for ${o.flight_no}`} className="h-8 w-28" />
                <Button type="submit" size="sm" variant="outline">Save</Button>
              </form>
              <form action={removeFlightOption}>
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="lead_id" value={leadId} />
                <Button type="submit" size="icon-sm" variant="ghost" aria-label={`Remove ${o.flight_no}`} title="Remove"><Trash2 /></Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Field label="From" htmlFor="fo_from">
          <AirportPicker id="fo_from" value={from} onChange={setFrom} />
        </Field>
        <Field label="To" htmlFor="fo_to">
          <AirportPicker id="fo_to" value={to} onChange={setTo} />
        </Field>
        <Field label="Date" htmlFor="fo_date">
          <DateInput id="fo_date" value={date} onChange={(e) => setDate(e.target.value)} className="sm:w-44" />
        </Field>
        <Button type="button" onClick={search} disabled={busy || !from || !to || !date}>{busy && !found ? 'Searching…' : 'Find flights'}</Button>
      </div>

      {error && <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>}

      {found && found.length > 0 && (
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">
            Tick the flights to offer and type your rate for each. Schedules by{' '}
            <a href="https://aerodatabox.com" target="_blank" rel="noopener noreferrer" className="underline">AeroDataBox</a>; check the timing before booking.
          </p>
          <ul className="grid max-h-96 gap-1.5 overflow-y-auto">
            {found.map((f) => {
              const on = picked[f.flight_no] !== undefined
              return (
                <li key={f.flight_no} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm ${on ? 'border-primary bg-primary/10' : 'border-border'}`}>
                  <label className="flex min-w-40 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={on}
                      onChange={(e) => setPicked((p) => ({ ...p, [f.flight_no]: e.target.checked ? '' : undefined }))}
                    />
                    <span>
                      <span className="font-medium">{f.airline} · {f.flight_no}</span>
                      <span className="block text-xs text-muted-foreground">{times(f)}</span>
                    </span>
                  </label>
                  {on && (
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">₹</span>
                      <Input
                        inputMode="decimal"
                        placeholder="Your rate"
                        aria-label={`Rate for ${f.flight_no}`}
                        className="h-8 w-28"
                        value={picked[f.flight_no] ?? ''}
                        onChange={(e) => setPicked((p) => ({ ...p, [f.flight_no]: e.target.value }))}
                      />
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <div>
            <Button
              type="button"
              disabled={busy || !chosen.length}
              onClick={() => save(chosen.map((f) => ({ ...f, price: picked[f.flight_no] ?? '' })), () => { setFound(null); setPicked({}) })}
            >
              {chosen.length ? `Save ${chosen.length} flight${chosen.length > 1 ? 's' : ''}` : 'Save selected'}
            </Button>
          </div>
        </div>
      )}

      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">Add a flight by hand</summary>
        <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1.2fr_1fr_auto_auto_1fr_auto]">
          <Field label="Airline" htmlFor="fo_airline">
            <Input id="fo_airline" value={manual.airline} onChange={(e) => setManual({ ...manual, airline: e.target.value })} placeholder="IndiGo" />
          </Field>
          <Field label="Flight no." htmlFor="fo_no">
            <Input id="fo_no" value={manual.flight_no} onChange={(e) => setManual({ ...manual, flight_no: e.target.value })} placeholder="6E 2135" />
          </Field>
          <Field label="Departs" htmlFor="fo_dep">
            <Input id="fo_dep" type="time" value={manual.depart_time} onChange={(e) => setManual({ ...manual, depart_time: e.target.value })} />
          </Field>
          <Field label="Arrives" htmlFor="fo_arr">
            <Input id="fo_arr" type="time" value={manual.arrive_time} onChange={(e) => setManual({ ...manual, arrive_time: e.target.value })} />
          </Field>
          <Field label="Your rate (₹)" htmlFor="fo_price">
            <Input id="fo_price" inputMode="decimal" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} />
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              save(
                [{ ...manual, depart_time: manual.depart_time || null, arrive_time: manual.arrive_time || null, from_code: from, to_code: to, travel_date: date }],
                () => setManual({ airline: '', flight_no: '', depart_time: '', arrive_time: '', price: '' }),
              )
            }
          >
            Add
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Uses the From, To and Date chosen above.</p>
      </details>

      {saved.length > 0 && saved.some((o) => !o.price) && (
        <p className="text-xs text-muted-foreground">Flights without a rate are sent without a price.</p>
      )}
      {saved.length === 0 && !found && !error && (
        <p className="text-xs text-muted-foreground">Choose the route and date, press Find flights, then tick 3–4 and type your rate.</p>
      )}
    </section>
  )
}
