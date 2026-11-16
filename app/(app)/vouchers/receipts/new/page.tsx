import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { getParties } from '../../../crm/leads/data'
import { ReceiptForm } from '../receipt-form'

export const metadata = { title: 'New receipt' }

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ party?: string; invoice?: string }> }) {
  const { party = '', invoice = '' } = await searchParams
  const { supabase, org } = await getContext()
  const [customers, { data: accounts }, { data: open }] = await Promise.all([
    getParties('customer'),
    supabase.from('ledgers').select('id, name, kind').eq('org_id', org.id).in('kind', ['bank', 'cash']).order('kind').order('name'),
    supabase
      .from('v_invoice_balance')
      .select('id, invoice_no, invoice_date, party_ledger_id, balance')
      .eq('org_id', org.id)
      .eq('doc_kind', 'invoice')
      .gt('balance', 0)
      .order('invoice_date'),
  ])
  return (
    <>
      <PageHeader title="New receipt" description="Money received from a client" />
      <ReceiptForm
        customers={customers}
        accounts={(accounts ?? []) as { id: string; name: string; kind: string }[]}
        open={(open ?? []).map((o) => ({ ...o, balance: Number(o.balance) }))}
        initialParty={party}
        initialInvoice={invoice}
        today={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
      />
    </>
  )
}
