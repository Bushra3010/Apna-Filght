import { notFound } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { ActionForm } from '@/components/action-form'
import { Field, NativeSelect, SubmitButton } from '@/components/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getCities, getLookups, getSuppliers } from '../../data'
import { HotelForm, type HotelRow } from '../hotel-form'
import { addHotelRate, deleteRow } from '../../masters-actions'

export const metadata = { title: 'Hotel' }

const RATE_TYPE: Record<string, string> = { per_room_night: 'Per room / night', per_person_night: 'Per person / night', extra_adult: 'Extra adult', extra_child: 'Extra child' }

export default async function HotelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: h }, { data: rates }, cities, suppliers, classes, categories, meals] = await Promise.all([
    supabase.from('hotels').select('*').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('hotel_rates').select('*, cls:lookups!hotel_rates_package_class_id_fkey(name), cat:lookups!hotel_rates_room_category_id_fkey(name), meal:lookups!hotel_rates_meal_plan_id_fkey(name)').eq('hotel_id', id).order('valid_from'),
    getCities(), getSuppliers(), getLookups('package_class'), getLookups('room_category'), getLookups('meal_plan'),
  ])
  if (!h) notFound()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const n = (v: unknown) => (v as { name: string } | null)?.name

  return (
    <>
      <PageHeader title={h.name} description="Hotel details and room rates" />
      <div className="grid gap-8">
        <section className="rounded-3xl bg-card p-5"><HotelForm h={h as HotelRow} cities={cities} suppliers={suppliers} /></section>

        <section className="grid gap-4">
          <h2 className="font-medium">Room rates</h2>
          {rates?.length ? (
            <div className="overflow-x-auto rounded-3xl bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead><TableHead>Room</TableHead><TableHead>Meal plan</TableHead><TableHead>Pax/room</TableHead>
                    <TableHead>Rate type</TableHead><TableHead className="text-right">Sell</TableHead><TableHead className="text-right">Cost</TableHead>
                    <TableHead>Valid</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((r) => (
                    <TableRow key={r.id} className={r.valid_to < today ? 'text-muted-foreground' : undefined}>
                      <TableCell>{n(r.cls)}</TableCell><TableCell>{n(r.cat)}</TableCell><TableCell>{n(r.meal)}</TableCell>
                      <TableCell>{r.pax_per_room}</TableCell><TableCell>{RATE_TYPE[r.rate_type]}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(r.sell_rate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(r.cost_rate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{new Date(r.valid_from).toLocaleDateString('en-IN')} – {new Date(r.valid_to).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>
                        <form action={deleteRow}>
                          <input type="hidden" name="table" value="hotel_rates" /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={`/crm/hotels/${id}`} />
                          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete rate"><Trash2 /></Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No rates yet.</p>
          )}

          <ActionForm action={addHotelRate} className="grid gap-3 rounded-3xl bg-card p-5 sm:grid-cols-3 lg:grid-cols-5">
            <input type="hidden" name="hotel_id" value={id} />
            <p className="col-span-full text-sm font-medium">Add a rate</p>
            <Field label="Package class" htmlFor="package_class_id">
              <NativeSelect id="package_class_id" name="package_class_id"><option value="">—</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
            </Field>
            <Field label="Room category" htmlFor="room_category_id">
              <NativeSelect id="room_category_id" name="room_category_id"><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
            </Field>
            <Field label="Meal plan" htmlFor="meal_plan_id">
              <NativeSelect id="meal_plan_id" name="meal_plan_id"><option value="">—</option>{meals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect>
            </Field>
            <Field label="Rate type" htmlFor="rate_type">
              <NativeSelect id="rate_type" name="rate_type">{Object.entries(RATE_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
            </Field>
            <Field label="Pax / room" htmlFor="pax_per_room"><Input id="pax_per_room" name="pax_per_room" type="number" min={1} max={10} defaultValue={2} /></Field>
            <Field label="Selling rate (₹)" htmlFor="sell_rate" required><Input id="sell_rate" name="sell_rate" inputMode="decimal" className="text-right" required /></Field>
            <Field label="Cost rate (₹)" htmlFor="cost_rate"><Input id="cost_rate" name="cost_rate" inputMode="decimal" className="text-right" /></Field>
            <Field label="Valid from" htmlFor="valid_from" required><Input id="valid_from" name="valid_from" type="date" required /></Field>
            <Field label="Valid to" htmlFor="valid_to" required><Input id="valid_to" name="valid_to" type="date" required /></Field>
            <div className="flex items-end"><SubmitButton>Add rate</SubmitButton></div>
          </ActionForm>
        </section>
      </div>
    </>
  )
}
