import { getContext } from '@/lib/context'
import { formatDateTimeIST, todayIST } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Field, NativeSelect } from '@/components/form'
import { Input } from '@/components/ui/input'
import { ImportWizard, type SavedMapping } from '@/components/import-wizard'
import { BILLING_FIELDS } from '@/lib/import/fields'
import { importBilling } from './actions'

export const metadata = { title: 'Import bookings' }

const SAMPLE = [
  { invoice_date: '15/11/2026', client: 'Sharma Enterprises', pax_name: 'RAHUL SHARMA', pax_type: 'Adult', airline: '6E', flight_no: '6E 2134', sector: 'DEL-BOM', travel_date: '20/11/2026', pnr: 'ABC123', ticket_no: '0981234567890', basic: '4500', xt: '820', service_fee: '300', supplier: 'Consolidator Pvt Ltd', purchase_gross: '5320', commission: '60' },
  { invoice_date: '15/11/2026', client: 'Sharma Enterprises', pax_name: 'PRIYA SHARMA', pax_type: 'Adult', airline: '6E', flight_no: '6E 2134', sector: 'DEL-BOM', travel_date: '20/11/2026', pnr: 'ABC123', ticket_no: '0981234567891', basic: '4500', xt: '820', service_fee: '300', supplier: 'Consolidator Pvt Ltd', purchase_gross: '5320', commission: '60' },
]

export default async function ImportBillingPage() {
  const { supabase, org } = await getContext()
  const [{ data: ledgers }, { data: maps }, { data: batches }] = await Promise.all([
    supabase.from('ledgers').select('id, name, kind').eq('org_id', org.id).in('kind', ['customer', 'supplier']).eq('is_active', true).order('name'),
    supabase.from('import_mappings').select('name, mapping, defaults').eq('org_id', org.id).eq('target', 'billing').order('name'),
    supabase.from('import_batches').select('id, file_name, format, row_count, status, created_at').eq('org_id', org.id).eq('target', 'billing').order('created_at', { ascending: false }).limit(8),
  ])
  const customers = (ledgers ?? []).filter((l) => l.kind === 'customer')
  const suppliers = (ledgers ?? []).filter((l) => l.kind === 'supplier')

  return (
    <>
      <PageHeader title="Import bookings" description="Turn a ticket report from your airline portal or GDS into invoices. Tickets already invoiced are skipped, so the same file can be imported twice safely." />
      <ImportWizard fields={BILLING_FIELDS} action={importBilling} saved={(maps ?? []) as SavedMapping[]} sample={{ file: 'bookings-sample.csv', rows: SAMPLE }}>
        <Field label="Invoice type" htmlFor="bill_type">
          <NativeSelect id="bill_type" name="bill_type" defaultValue="domestic">
            <option value="domestic">Domestic flight</option>
            <option value="international">International flight</option>
          </NativeSelect>
        </Field>
        <Field label="Invoice date when the file has none" htmlFor="invoice_date">
          <Input id="invoice_date" name="invoice_date" type="date" defaultValue={todayIST()} />
        </Field>
        <Field label="GST rate on service fee" htmlFor="gst_rate">
          <NativeSelect id="gst_rate" name="gst_rate" defaultValue="18">
            {['0', '5', '12', '18', '28'].map((r) => <option key={r} value={r}>{r}%</option>)}
          </NativeSelect>
        </Field>
        <Field label="Client when the file has none" htmlFor="client_ledger_id">
          <NativeSelect id="client_ledger_id" name="client_ledger_id" defaultValue="">
            <option value="">—</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Supplier when the file has none" htmlFor="supplier_ledger_id">
          <NativeSelect id="supplier_ledger_id" name="supplier_ledger_id" defaultValue="">
            <option value="">—</option>
            {suppliers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="One invoice per" htmlFor="group_by">
          <NativeSelect id="group_by" name="group_by" defaultValue="pnr">
            <option value="pnr">PNR (passengers on one booking together)</option>
            <option value="row">Row (one ticket each)</option>
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="create_missing" className="size-4 accent-[var(--primary)]" />
          Create clients that are not in Ledgers yet
        </label>
      </ImportWizard>

      {!!batches?.length && (
        <section className="mt-8 rounded-3xl bg-card p-5 md:p-6">
          <h2 className="mb-3 text-lg font-semibold">Recent imports</h2>
          <ul className="grid gap-2 text-sm">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-2">
                <span className="tabular-nums text-muted-foreground">{formatDateTimeIST(b.created_at)}</span>
                <span className="font-medium">{b.file_name ?? '—'}</span>
                <span className="text-muted-foreground">{b.row_count} row(s)</span>
                <span className={b.status === 'generated' ? 'text-primary' : b.status === 'failed' ? 'text-destructive' : 'text-tile-orange'}>
                  {b.status === 'generated' ? 'All imported' : b.status === 'failed' ? 'Nothing imported' : 'Partly imported'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
