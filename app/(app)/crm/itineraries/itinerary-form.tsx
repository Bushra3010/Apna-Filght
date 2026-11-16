'use client'

import { useActionState, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Field, FormError, NativeSelect, SubmitButton } from '@/components/form'
import { LinkButton } from '@/components/link-button'
import { saveItinerary } from './actions'

type Opt = { id: string; name: string }
type Day = { city_id: string; title: string; description: string }
export type ItineraryDraft = { id?: string; title: string; route_id: string; package_title_id: string; nights: string; overview: string; days: Day[] }

export function ItineraryForm({ draft: initial, routes, titles, cities }: { draft: ItineraryDraft; routes: Opt[]; titles: Opt[]; cities: Opt[] }) {
  const [state, action] = useActionState(saveItinerary, undefined)
  const [d, setD] = useState(initial)
  const set = <K extends keyof ItineraryDraft>(k: K, v: ItineraryDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const setDay = (i: number, patch: Partial<Day>) => setD((x) => ({ ...x, days: x.days.map((day, j) => (j === i ? { ...day, ...patch } : day)) }))
  const move = (i: number, by: number) =>
    setD((x) => {
      const days = [...x.days]
      const [it] = days.splice(i, 1)
      days.splice(i + by, 0, it)
      return { ...x, days }
    })

  // keep one day per night + 1 when the nights change
  function setNights(v: string) {
    const n = Math.max(0, Math.min(60, Number(v) || 0))
    setD((x) => {
      const days = [...x.days]
      while (days.length < n + 1) days.push({ city_id: '', title: '', description: '' })
      return { ...x, nights: v, days }
    })
  }

  return (
    <form action={action} className="grid max-w-4xl gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(d)} />
      <section className="grid gap-4 rounded-3xl bg-card p-5 sm:grid-cols-2">
        <Field label="Title" htmlFor="title" required className="sm:col-span-2">
          <Input id="title" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Himachal 4 nights / 5 days" />
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
            {titles.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Nights" htmlFor="nights">
          <Input id="nights" type="number" min={0} max={60} value={d.nights} onChange={(e) => setNights(e.target.value)} />
        </Field>
        <Field label="Overview" htmlFor="overview" className="sm:col-span-2">
          <Textarea id="overview" rows={3} value={d.overview} onChange={(e) => set('overview', e.target.value)} />
        </Field>
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Day-wise plan</h2>
        {d.days.map((day, i) => (
          <div key={i} className="grid gap-3 rounded-3xl bg-card p-5 sm:grid-cols-[70px_1fr_200px_auto]">
            <span className="pt-1.5 text-sm font-medium">Day {i + 1}</span>
            <Input aria-label={`Day ${i + 1} title`} placeholder="Arrive Shimla, check in" value={day.title} onChange={(e) => setDay(i, { title: e.target.value })} />
            <NativeSelect aria-label={`Day ${i + 1} city`} value={day.city_id} onChange={(e) => setDay(i, { city_id: e.target.value })}>
              <option value="">City —</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
            <div className="flex gap-0.5">
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move day ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move day ${i + 1} down`} disabled={i === d.days.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove day ${i + 1}`} onClick={() => setD((x) => ({ ...x, days: x.days.filter((_, j) => j !== i) }))}><Trash2 /></Button>
            </div>
            <Textarea aria-label={`Day ${i + 1} details`} rows={2} className="sm:col-span-3 sm:col-start-2" placeholder="What happens this day" value={day.description} onChange={(e) => setDay(i, { description: e.target.value })} />
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setD((x) => ({ ...x, days: [...x.days, { city_id: '', title: '', description: '' }] }))}>
            <Plus /> Add day
          </Button>
        </div>
      </section>

      <FormError state={state} />
      <div className="flex gap-2">
        <SubmitButton>Save itinerary</SubmitButton>
        <LinkButton href="/crm/itineraries" variant="outline">Back</LinkButton>
      </div>
    </form>
  )
}
