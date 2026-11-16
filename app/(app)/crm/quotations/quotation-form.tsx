'use client'

import { useActionState, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import { GST_RATES } from '@/lib/gst'
import { blankItem, quoteTotals, type QuoteDraft, type QuoteItem, type QuoteItemKind } from '@/lib/quotation'
import { cn } from '@/lib/utils'
import { saveQuotation } from './actions'
import type { ActivityOpt, HotelRateOpt, ItineraryOpt, VehicleOpt } from './data'

type Opt = { id: string; name: string }
type Props = {
  draft: QuoteDraft
  customers: Opt[]
  classes: Opt[]
  titles: Opt[]
  meals: Opt[]
  routes: Opt[]
  itineraries: ItineraryOpt[]
  hotelRates: HotelRateOpt[]
  activities: ActivityOpt[]
  vehicles: VehicleOpt[]
  policies: { id: string; name: string; body: string }[]
}

const KIND_LABEL: Record<QuoteItemKind, string> = {
  hotel: 'Hotel', activity: 'Activity', vehicle: 'Transport', flight: 'Flight', visa: 'Visa', insurance: 'Insurance', other: 'Other',
}
const RATE_UNIT: Record<string, string> = { per_room_night: '/room/night', per_person_night: '/person/night', extra_adult: '/extra adult/night', extra_child: '/extra child/night' }

export function QuotationForm(props: Props) {
  const { customers, classes, titles, meals, routes, itineraries, hotelRates, activities, vehicles, policies } = props
  const [state, action] = useActionState(saveQuotation, undefined)
  const [d, setD] = useState<QuoteDraft>(props.draft)
  const set = <K extends keyof QuoteDraft>(k: K, v: QuoteDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const setItem = (i: number, patch: Partial<QuoteItem>) => setD((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }))
  const addItem = (it: QuoteItem) => setD((x) => ({ ...x, items: [...x.items.filter((y) => y.description || y.unit_price), it] }))

  const pax = (Number(d.adults) || 0) + (Number(d.children) || 0)
  const nights = Number(d.nights) || 0
  const t = useMemo(() => quoteTotals(d.items, Number(d.gst_rate), toPaise), [d.items, d.gst_rate])

  // ---- add-item panel state
  const [tab, setTab] = useState<'hotel' | 'activity' | 'vehicle' | 'other'>('hotel')
  const [classFilter, setClassFilter] = useState('')
  const [rateId, setRateId] = useState('')
  const [rooms, setRooms] = useState('1')
  const [hotelNights, setHotelNights] = useState('')
  const [actId, setActId] = useState('')
  const [actQty, setActQty] = useState('')
  const [vehId, setVehId] = useState('')
  const [km, setKm] = useState('')
  const [markup, setMarkup] = useState('15')

  const usableRates = hotelRates.filter(
    (r) => (!classFilter || r.class_id === classFilter) && (!d.start_date || (r.valid_from <= d.start_date && d.start_date <= r.valid_to)),
  )

  function addHotel() {
    const r = hotelRates.find((x) => x.id === rateId)
    if (!r) return
    const n = Number(hotelNights || nights || 1)
    const qty = r.rate_type === 'per_room_night' ? Number(rooms || 1) * n : r.rate_type === 'per_person_night' ? (pax || 1) * n : n
    const what = r.rate_type === 'per_room_night' ? `${rooms || 1} room(s) × ${n} night(s)` : r.rate_type === 'per_person_night' ? `${pax || 1} pax × ${n} night(s)` : `${n} night(s), ${r.rate_type.replace('_', ' ')}`
    addItem({ ...blankItem('hotel'), hotel_rate_id: r.id, description: `${[r.hotel, r.category, r.meal].filter(Boolean).join(', ')} – ${what}`, qty: String(qty), unit_cost: paiseToInput(r.cost), unit_price: paiseToInput(r.sell) })
    setRateId('')
  }
  function addActivity() {
    const a = activities.find((x) => x.id === actId)
    if (!a) return
    const qty = a.unit === 'per_person' ? Number(actQty || pax || 1) : Number(actQty || 1)
    addItem({ ...blankItem('activity'), activity_rate_id: a.id, description: a.label, qty: String(qty), unit_cost: paiseToInput(a.cost), unit_price: paiseToInput(a.sell) })
    setActId('')
    setActQty('')
  }
  function addVehicle() {
    const v = vehicles.find((x) => x.id === vehId)
    if (!v) return
    const days = nights + 1
    const kms = Math.max(Number(km) || 0, v.min_km_per_day * days)
    const cost = v.rate_per_km * kms + v.night_charge * nights
    addItem({ ...blankItem('vehicle'), vehicle_id: v.id, description: `${v.name} – ${kms} km, ${nights} night(s)`, qty: '1', unit_cost: paiseToInput(cost), unit_price: paiseToInput(cost) })
    setVehId('')
    setKm('')
  }
  function applyMarkup() {
    const m = Number(markup) / 100
    if (!Number.isFinite(m)) return
    setD((x) => ({ ...x, items: x.items.map((it) => (toPaise(it.unit_cost) > 0 ? { ...it, unit_price: paiseToInput(Math.round(toPaise(it.unit_cost) * (1 + m))) } : it)) }))
  }
  function chooseItinerary(id: string) {
    const it = itineraries.find((x) => x.id === id)
    setD((x) => ({
      ...x,
      itinerary_id: id,
      route_id: it?.route_id ?? x.route_id,
      package_title_id: it?.package_title_id ?? x.package_title_id,
      nights: it ? String(it.nights) : x.nights,
    }))
  }

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(d)} />

      <section className="grid gap-4 rounded-3xl bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Client name" htmlFor="client_name" required className="sm:col-span-2">
          <Input id="client_name" value={d.client_name} onChange={(e) => set('client_name', e.target.value)} />
        </Field>
        <Field label="Client account" htmlFor="party" hint="Needed to raise a proforma or invoice">
          <NativeSelect id="party" value={d.party_ledger_id} onChange={(e) => {
            const c = customers.find((x) => x.id === e.target.value)
            setD((x) => ({ ...x, party_ledger_id: e.target.value, client_name: x.client_name || c?.name || '' }))
          }}>
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Quotation date" htmlFor="quote_date" required>
          <Input id="quote_date" type="date" value={d.quote_date} onChange={(e) => set('quote_date', e.target.value)} />
        </Field>
        <Field label="Itinerary" htmlFor="itinerary" className="sm:col-span-2">
          <NativeSelect id="itinerary" value={d.itinerary_id} onChange={(e) => chooseItinerary(e.target.value)}>
            <option value="">— None —</option>
            {itineraries.map((i) => <option key={i.id} value={i.id}>{i.title} ({i.nights}N)</option>)}
          </NativeSelect>
        </Field>
        <Field label="Route" htmlFor="route">
          <NativeSelect id="route" value={d.route_id} onChange={(e) => set('route_id', e.target.value)}>
            <option value="">—</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Package title" htmlFor="ptitle">
          <NativeSelect id="ptitle" value={d.package_title_id} onChange={(e) => set('package_title_id', e.target.value)}>
            <option value="">—</option>
            {titles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Start date" htmlFor="start_date">
          <Input id="start_date" type="date" value={d.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </Field>
        <Field label="Nights" htmlFor="nights">
          <Input id="nights" type="number" min={0} value={d.nights} onChange={(e) => set('nights', e.target.value)} />
        </Field>
        <Field label="Meal plan" htmlFor="meal">
          <NativeSelect id="meal" value={d.meal_plan_id} onChange={(e) => set('meal_plan_id', e.target.value)}>
            <option value="">—</option>
            {meals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Valid until" htmlFor="valid_until">
          <Input id="valid_until" type="date" value={d.valid_until} onChange={(e) => set('valid_until', e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="Adults" htmlFor="adults" required><Input id="adults" type="number" min={1} value={d.adults} onChange={(e) => set('adults', e.target.value)} /></Field>
          <Field label="Children" htmlFor="children"><Input id="children" type="number" min={0} value={d.children} onChange={(e) => set('children', e.target.value)} /></Field>
          <Field label="Infants" htmlFor="infants"><Input id="infants" type="number" min={0} value={d.infants} onChange={(e) => set('infants', e.target.value)} /></Field>
        </div>
      </section>

      {/* -------- add items */}
      <section className="grid gap-3 rounded-3xl bg-card p-5">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Add item">
          {(['hotel', 'activity', 'vehicle', 'other'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('rounded-full border border-border bg-card px-3.5 py-1.5 text-sm', tab === k && 'border-primary bg-primary/10 font-medium')}>
              Add {KIND_LABEL[k].toLowerCase()}
            </button>
          ))}
        </div>
        {tab === 'hotel' && (
          <div className="grid gap-2 sm:grid-cols-[160px_1fr_90px_90px_auto]">
            <NativeSelect aria-label="Package class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
            <NativeSelect aria-label="Hotel rate" value={rateId} onChange={(e) => setRateId(e.target.value)}>
              <option value="">{usableRates.length ? 'Choose hotel rate' : d.start_date ? 'No rates valid on the start date' : 'No hotel rates yet'}</option>
              {usableRates.map((r) => <option key={r.id} value={r.id}>{r.label} – {formatINR(r.sell)}{RATE_UNIT[r.rate_type]}</option>)}
            </NativeSelect>
            <Input aria-label="Rooms" type="number" min={1} value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="Rooms" />
            <Input aria-label="Nights at this hotel" type="number" min={1} value={hotelNights} onChange={(e) => setHotelNights(e.target.value)} placeholder={`${nights || 1} nights`} />
            <Button type="button" variant="outline" onClick={addHotel} disabled={!rateId}><Plus /> Add</Button>
          </div>
        )}
        {tab === 'activity' && (
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
            <NativeSelect aria-label="Activity" value={actId} onChange={(e) => setActId(e.target.value)}>
              <option value="">{activities.length ? 'Choose activity' : 'No activity rates yet'}</option>
              {activities.map((a) => <option key={a.id} value={a.id}>{a.label} – {formatINR(a.sell)} {a.unit.replace('_', ' ')}</option>)}
            </NativeSelect>
            <Input aria-label="Quantity" type="number" min={1} value={actQty} onChange={(e) => setActQty(e.target.value)} placeholder={`${pax || 1} pax`} />
            <Button type="button" variant="outline" onClick={addActivity} disabled={!actId}><Plus /> Add</Button>
          </div>
        )}
        {tab === 'vehicle' && (
          <div className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
            <NativeSelect aria-label="Vehicle" value={vehId} onChange={(e) => setVehId(e.target.value)}>
              <option value="">{vehicles.length ? 'Choose vehicle' : 'No vehicles yet'}</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.capacity ? ` (${v.capacity} seats)` : ''} – {formatINR(v.rate_per_km)}/km</option>)}
            </NativeSelect>
            <Input aria-label="Total km" type="number" min={0} value={km} onChange={(e) => setKm(e.target.value)} placeholder="Total km" />
            <Button type="button" variant="outline" onClick={addVehicle} disabled={!vehId}><Plus /> Add</Button>
          </div>
        )}
        {tab === 'other' && (
          <div className="flex flex-wrap gap-2">
            {(['flight', 'visa', 'insurance', 'other'] as const).map((k) => (
              <Button key={k} type="button" variant="outline" size="sm" onClick={() => addItem(blankItem(k))}><Plus /> {KIND_LABEL[k]}</Button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Costs and prices fill in from your rate masters; you can change any figure below.</p>
      </section>

      {/* -------- items */}
      <section className="grid gap-2 rounded-3xl bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Items</h2>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="markup" className="text-muted-foreground">Markup on cost</label>
            <Input id="markup" inputMode="decimal" className="w-16 text-right" value={markup} onChange={(e) => setMarkup(e.target.value)} />
            <span>%</span>
            <Button type="button" variant="outline" size="sm" onClick={applyMarkup}>Apply to all</Button>
          </div>
        </div>
        <div className="hidden grid-cols-[90px_60px_1fr_70px_110px_110px_110px_32px] gap-2 text-xs text-muted-foreground lg:grid">
          <span>Type</span><span>Day</span><span>Description</span><span>Qty</span><span className="text-right">Unit cost</span><span className="text-right">Unit price</span><span className="text-right">Amount</span><span />
        </div>
        {d.items.map((it, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 border-b pb-2 last:border-0 lg:grid-cols-[90px_60px_1fr_70px_110px_110px_110px_32px] lg:border-0 lg:pb-0">
            <NativeSelect aria-label={`Item ${i + 1} type`} value={it.kind} onChange={(e) => setItem(i, { kind: e.target.value as QuoteItemKind })}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </NativeSelect>
            <Input aria-label={`Item ${i + 1} day`} type="number" min={1} placeholder="Day" value={it.day_no} onChange={(e) => setItem(i, { day_no: e.target.value })} />
            <Input aria-label={`Item ${i + 1} description`} className="col-span-2 lg:col-span-1" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
            <Input aria-label={`Item ${i + 1} quantity`} inputMode="decimal" className="text-right" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
            <Input aria-label={`Item ${i + 1} unit cost`} inputMode="decimal" className="text-right tabular-nums" value={it.unit_cost} onChange={(e) => setItem(i, { unit_cost: e.target.value })} />
            <Input aria-label={`Item ${i + 1} unit price`} inputMode="decimal" className="text-right tabular-nums" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value })} />
            <span className="flex h-8 items-center justify-end text-sm tabular-nums">{formatINR(Math.round((Number(it.qty) || 0) * toPaise(it.unit_price)))}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove item ${i + 1}`} onClick={() => setD((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {!d.items.length && <p className="text-sm text-muted-foreground">Add hotels, activities, transport or other items above.</p>}
      </section>

      <section className="grid gap-4 rounded-3xl bg-card p-5 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inclusions" htmlFor="inclusions"><Textarea id="inclusions" rows={4} value={d.inclusions} onChange={(e) => set('inclusions', e.target.value)} /></Field>
          <Field label="Exclusions" htmlFor="exclusions"><Textarea id="exclusions" rows={4} value={d.exclusions} onChange={(e) => set('exclusions', e.target.value)} /></Field>
          <Field label="Terms & policies" htmlFor="terms" className="sm:col-span-2">
            <Textarea id="terms" rows={4} value={d.terms} onChange={(e) => set('terms', e.target.value)} />
          </Field>
          {policies.length > 0 && (
            <div className="flex flex-wrap gap-1.5 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Insert:</span>
              {policies.map((p) => (
                <button key={p.id} type="button" className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                  onClick={() => set('terms', [d.terms, `${p.name}\n${p.body}`].filter(Boolean).join('\n\n'))}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <dl className="grid content-start gap-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Your cost</dt><dd className="tabular-nums">{formatINR(t.cost)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Margin</dt><dd className={t.margin < 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>{formatINR(t.margin)}{t.sub > 0 && ` (${Math.round((t.margin / t.sub) * 100)}%)`}</dd></div>
          <div className="my-1 border-t" />
          <div className="flex justify-between"><dt className="text-muted-foreground">Package price</dt><dd className="tabular-nums">{formatINR(t.sub)}</dd></div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">GST</dt>
            <dd className="flex items-center gap-2">
              <NativeSelect aria-label="GST rate" className="h-7 w-20" value={d.gst_rate} onChange={(e) => set('gst_rate', e.target.value)}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </NativeSelect>
              <span className="tabular-nums">{formatINR(t.tax)}</span>
            </dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatINR(t.total)}</dd></div>
          {pax > 0 && <div className="flex justify-between text-muted-foreground"><dt>Per person ({pax})</dt><dd className="tabular-nums">{formatINR(Math.round(t.total / pax))}</dd></div>}
        </dl>
      </section>

      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save quotation</SubmitButton>
        <LinkButton href={d.id ? `/crm/quotations/${d.id}` : '/crm/quotations'} variant="outline">Cancel</LinkButton>
      </div>
    </form>
  )
}
