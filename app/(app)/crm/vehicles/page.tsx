import { Trash2 } from 'lucide-react'
import { getContext } from '@/lib/context'
import { paiseToInput } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { ActionForm } from '@/components/action-form'
import { NativeSelect, SubmitButton } from '@/components/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getSuppliers } from '../data'
import { deleteRow, saveVehicle } from '../masters-actions'

export const metadata = { title: 'Vehicles' }

type V = { id?: string; name?: string; capacity?: number | null; rate_per_km?: number; min_km_per_day?: number; night_charge?: number; supplier_ledger_id?: string | null }

export default async function VehiclesPage() {
  const { supabase, org } = await getContext()
  const [{ data: rows }, suppliers] = await Promise.all([
    supabase.from('vehicles').select('id, name, capacity, rate_per_km, min_km_per_day, night_charge, supplier_ledger_id').eq('org_id', org.id).order('name'),
    getSuppliers(),
  ])
  const row = (v: V, isNew: boolean) => (
    <ActionForm key={v.id ?? 'new'} action={saveVehicle} resetOnSuccess={isNew} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.4fr_80px_110px_110px_110px_1.2fr_auto]">
      <input type="hidden" name="id" value={v.id ?? ''} />
      <Input name="name" aria-label="Vehicle" placeholder="e.g. Innova Crysta" defaultValue={v.name} required />
      <Input name="capacity" aria-label="Seats" type="number" min={1} placeholder="Seats" defaultValue={v.capacity ?? ''} />
      <Input name="rate_per_km" aria-label="Rate per km (₹)" inputMode="decimal" placeholder="₹/km" className="text-right" defaultValue={paiseToInput(v.rate_per_km)} />
      <Input name="min_km_per_day" aria-label="Minimum km per day" type="number" min={0} placeholder="Min km/day" defaultValue={v.min_km_per_day ?? 0} />
      <Input name="night_charge" aria-label="Night charge (₹)" inputMode="decimal" placeholder="Night ₹" className="text-right" defaultValue={paiseToInput(v.night_charge)} />
      <NativeSelect name="supplier_ledger_id" aria-label="Supplier" defaultValue={v.supplier_ledger_id ?? ''}>
        <option value="">Supplier —</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </NativeSelect>
      <SubmitButton>{isNew ? 'Add' : 'Save'}</SubmitButton>
    </ActionForm>
  )
  return (
    <>
      <PageHeader title="Vehicles" description="Per-km pricing for transport in quotations" />
      <div className="mb-2 hidden grid-cols-[1.4fr_80px_110px_110px_110px_1.2fr_auto_auto] gap-2 text-xs text-muted-foreground sm:grid">
        <span>Vehicle</span><span>Seats</span><span>₹ / km</span><span>Min km / day</span><span>Night charge</span><span>Supplier</span>
      </div>
      <div className="grid gap-2">
        {rows?.map((v) => (
          <div key={v.id} className="flex items-start gap-1">
            <div className="flex-1">{row(v, false)}</div>
            <form action={deleteRow}>
              <input type="hidden" name="table" value="vehicles" /><input type="hidden" name="id" value={v.id} /><input type="hidden" name="back" value="/crm/vehicles" />
              <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Delete ${v.name}`}><Trash2 /></Button>
            </form>
          </div>
        ))}
        <div className="mt-2 rounded-3xl border border-dashed border-border p-3">{row({}, true)}</div>
      </div>
    </>
  )
}
