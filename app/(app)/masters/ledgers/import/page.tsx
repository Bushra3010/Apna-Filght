import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { Field, NativeSelect } from '@/components/form'
import { ImportWizard, type SavedMapping } from '@/components/import-wizard'
import { LEDGER_FIELDS } from '@/lib/import/fields'
import { LEDGER_KINDS } from '@/lib/ledgers'
import { importLedgers } from './actions'

export const metadata = { title: 'Import ledgers' }

const SAMPLE = [
  { name: 'Sharma Enterprises', kind: 'Client', gstin: '27ABCDE1234F1Z5', state: 'Maharashtra', mobile: '9876543210', email: 'accounts@example.com', address: 'Andheri East, Mumbai', credit_days: '15', opening: '12500' },
  { name: 'Consolidator Pvt Ltd', kind: 'Supplier', gstin: '', state: '07', mobile: '', email: '', address: 'New Delhi', credit_days: '0', opening: '-40000' },
]

export default async function ImportLedgersPage() {
  const { supabase, org, fy } = await getContext()
  const { data: maps } = await supabase.from('import_mappings').select('name, mapping, defaults').eq('org_id', org.id).eq('target', 'ledgers').order('name')
  return (
    <>
      <PageHeader title="Import ledgers" description={`Bring in clients, suppliers and accounts from Tally or a spreadsheet, with opening balances for FY ${fy.label}. Names already in Ledgers are skipped.`} />
      <ImportWizard fields={LEDGER_FIELDS} action={importLedgers} saved={(maps ?? []) as SavedMapping[]} sample={{ file: 'ledgers-sample.csv', rows: SAMPLE }}>
        <Field label="Type when the file has none" htmlFor="default_kind">
          <NativeSelect id="default_kind" name="default_kind" defaultValue="customer">
            {LEDGER_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </Field>
      </ImportWizard>
    </>
  )
}
