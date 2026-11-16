import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { Field, NativeSelect } from '@/components/form'
import { ImportWizard } from '@/components/import-wizard-lazy'
import type { SavedMapping } from '@/components/import-wizard'
import { VOUCHER_FIELDS } from '@/lib/import/fields'
import { importVouchers } from './actions'

export const metadata = { title: 'Import receipts & payments' }

const SAMPLE = [
  { date: '14/11/2026', party: 'Sharma Enterprises', amount: '11,240.00', mode: 'UPI', reference: 'UTR4521876', narration: 'Against DEL-BOM tickets' },
  { date: '15/11/2026', party: 'Mehta Travels', amount: '25000', mode: 'NEFT', reference: 'N318265400', narration: '' },
]

export default async function ImportVouchersPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: k } = await searchParams
  const kind = k === 'payment' ? 'payment' : 'receipt'
  const { supabase, org } = await getContext()
  const [{ data: accounts }, { data: maps }] = await Promise.all([
    supabase.from('ledgers').select('id, name, kind').eq('org_id', org.id).eq('is_active', true).in('kind', ['bank', 'cash']).order('kind').order('name'),
    supabase.from('import_mappings').select('name, mapping, defaults').eq('org_id', org.id).eq('target', 'vouchers').order('name'),
  ])
  return (
    <>
      <PageHeader title="Import receipts & payments" description="Load a bank statement or collection report. Each row becomes a receipt or payment on account; references already entered are skipped." />
      <ImportWizard fields={VOUCHER_FIELDS} action={importVouchers} saved={(maps ?? []) as SavedMapping[]} sample={{ file: 'receipts-sample.csv', rows: SAMPLE }}>
        <Field label="Rows are" htmlFor="kind">
          <NativeSelect id="kind" name="kind" defaultValue={kind}>
            <option value="receipt">Receipts (money in)</option>
            <option value="payment">Payments (money out)</option>
          </NativeSelect>
        </Field>
        <Field label="Cash / bank account" htmlFor="cash_bank_ledger_id" required>
          <NativeSelect id="cash_bank_ledger_id" name="cash_bank_ledger_id" defaultValue="">
            <option value="">Choose…</option>
            {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Mode when the file has none" htmlFor="default_mode">
          <NativeSelect id="default_mode" name="default_mode" defaultValue="bank_transfer">
            <option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="card">Card</option>
          </NativeSelect>
        </Field>
      </ImportWizard>
    </>
  )
}
