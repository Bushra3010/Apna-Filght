import { Trash2 } from 'lucide-react'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { ActionForm } from '@/components/action-form'
import { NativeSelect, SubmitButton } from '@/components/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getLookups, getSuppliers } from '../data'
import { deleteRow, saveRoute } from '../masters-actions'

export const metadata = { title: 'Routes' }

type R = { id?: string; name?: string; destination_id?: string | null; has_transport?: boolean; supplier_ledger_id?: string | null }

export default async function RoutesPage() {
  const { supabase, org } = await getContext()
  const [{ data: rows }, destinations, suppliers] = await Promise.all([
    supabase.from('routes').select('id, name, destination_id, has_transport, supplier_ledger_id').eq('org_id', org.id).order('name'),
    getLookups('destination'), getSuppliers(),
  ])
  const row = (r: R, isNew: boolean) => (
    <ActionForm action={saveRoute} resetOnSuccess={isNew} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[2fr_1fr_auto_1fr_auto]">
      <input type="hidden" name="id" value={r.id ?? ''} />
      <Input name="name" aria-label="Route" placeholder="Delhi – Shimla – Manali – Delhi" defaultValue={r.name} required />
      <NativeSelect name="destination_id" aria-label="Destination" defaultValue={r.destination_id ?? ''}>
        <option value="">Destination —</option>
        {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </NativeSelect>
      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="has_transport" defaultChecked={r.has_transport} className="size-4" /> Transport</label>
      <NativeSelect name="supplier_ledger_id" aria-label="Supplier" defaultValue={r.supplier_ledger_id ?? ''}>
        <option value="">Supplier —</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </NativeSelect>
      <SubmitButton>{isNew ? 'Add' : 'Save'}</SubmitButton>
    </ActionForm>
  )
  return (
    <>
      <PageHeader title="Routes" description="Route charts for itineraries and quotations" />
      <div className="grid gap-2">
        {rows?.map((r) => (
          <div key={r.id} className="flex items-start gap-1">
            <div className="flex-1">{row(r, false)}</div>
            <form action={deleteRow}>
              <input type="hidden" name="table" value="routes" /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value="/crm/routes" />
              <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`}><Trash2 /></Button>
            </form>
          </div>
        ))}
        <div className="mt-2 rounded-3xl border border-dashed border-border p-3">{row({}, true)}</div>
      </div>
    </>
  )
}
