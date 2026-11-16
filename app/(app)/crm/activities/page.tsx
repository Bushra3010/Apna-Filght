import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { ActionForm } from '@/components/action-form'
import { Field, NativeSelect, SubmitButton } from '@/components/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getCities, getLookups, getSuppliers } from '../data'
import { addActivityRate, deleteRow } from '../masters-actions'

export const metadata = { title: 'Activity rates' }
const UNIT: Record<string, string> = { per_person: 'Per person', per_group: 'Per group', per_vehicle: 'Per vehicle' }

export default async function ActivitiesPage() {
  const { supabase, org } = await getContext()
  const [{ data: rows }, activities, cities, suppliers] = await Promise.all([
    supabase.from('activity_rates').select('*, act:lookups!activity_rates_activity_id_fkey(name), cities(name)').eq('org_id', org.id).order('created_at', { ascending: false }).limit(500),
    getLookups('activity'), getCities(), getSuppliers(),
  ])
  const n = (v: unknown) => (v as { name: string } | null)?.name
  return (
    <>
      <PageHeader title="Activity rates" description="Sightseeing and experiences you add to quotations" />
      <ActionForm action={addActivityRate} className="mb-6 grid gap-3 rounded-3xl bg-card p-5 sm:grid-cols-3 lg:grid-cols-5">
        <p className="col-span-full text-sm font-medium">
          Add a rate {!activities.length && <span className="font-normal text-muted-foreground">— first add activity names under <Link href="/masters/lists?kind=activity" className="underline">Lists → Activities</Link></span>}
        </p>
        <Field label="Activity" htmlFor="activity_id" required>
          <NativeSelect id="activity_id" name="activity_id" required><option value="">Select</option>{activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</NativeSelect>
        </Field>
        <Field label="City" htmlFor="city_id"><NativeSelect id="city_id" name="city_id"><option value="">—</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></Field>
        <Field label="Location" htmlFor="location"><Input id="location" name="location" /></Field>
        <Field label="Unit" htmlFor="unit"><NativeSelect id="unit" name="unit">{Object.entries(UNIT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect></Field>
        <Field label="Duration (min)" htmlFor="duration_minutes"><Input id="duration_minutes" name="duration_minutes" type="number" min={1} /></Field>
        <Field label="Start" htmlFor="start_time"><Input id="start_time" name="start_time" type="time" /></Field>
        <Field label="End" htmlFor="end_time"><Input id="end_time" name="end_time" type="time" /></Field>
        <Field label="Selling rate (₹)" htmlFor="sell_rate" required><Input id="sell_rate" name="sell_rate" inputMode="decimal" className="text-right" required /></Field>
        <Field label="Cost rate (₹)" htmlFor="cost_rate"><Input id="cost_rate" name="cost_rate" inputMode="decimal" className="text-right" /></Field>
        <Field label="Supplier" htmlFor="supplier_ledger_id"><NativeSelect id="supplier_ledger_id" name="supplier_ledger_id"><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <div className="flex items-end"><SubmitButton>Add rate</SubmitButton></div>
      </ActionForm>
      {rows?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Activity</TableHead><TableHead>City</TableHead><TableHead>Location</TableHead><TableHead>Unit</TableHead><TableHead>Timing</TableHead><TableHead className="text-right">Sell</TableHead><TableHead className="text-right">Cost</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{n(r.act)}</TableCell><TableCell>{n(r.cities)}</TableCell><TableCell>{r.location}</TableCell><TableCell>{UNIT[r.unit]}</TableCell>
                  <TableCell className="whitespace-nowrap">{[r.start_time?.slice(0, 5), r.end_time?.slice(0, 5)].filter(Boolean).join('–')}{r.duration_minutes ? ` · ${r.duration_minutes} min` : ''}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.sell_rate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.cost_rate)}</TableCell>
                  <TableCell>
                    <form action={deleteRow}>
                      <input type="hidden" name="table" value="activity_rates" /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value="/crm/activities" />
                      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete rate"><Trash2 /></Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No activity rates yet.</EmptyState>
      )}
    </>
  )
}
