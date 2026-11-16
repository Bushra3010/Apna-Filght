import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { getAllLedgers, today } from '../../data'
import { PaymentForm, type OpenDoc } from '../../voucher-forms'

export const metadata = { title: 'New payment' }

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ party?: string; invoice?: string; bill?: string }> }) {
  const sp = await searchParams
  const { supabase, org } = await getContext()
  const [ledgers, { data: refunds }, { data: bills }] = await Promise.all([
    getAllLedgers(),
    supabase.from('v_invoice_balance').select('id, invoice_no, invoice_date, party_ledger_id, balance').eq('org_id', org.id).lt('balance', 0).order('invoice_date'),
    supabase.from('v_purchase_balance').select('id, bill_no, supplier_bill_no, bill_date, supplier_ledger_id, balance').eq('org_id', org.id).gt('balance', 0).order('bill_date'),
  ])
  const open: OpenDoc[] = [
    ...(refunds ?? []).map((r) => ({ id: r.id, no: r.invoice_no, date: r.invoice_date, party: r.party_ledger_id, due: -Number(r.balance), type: 'refund' as const })),
    ...(bills ?? []).map((b) => ({ id: b.id, no: b.supplier_bill_no ? `${b.bill_no} (${b.supplier_bill_no})` : b.bill_no, date: b.bill_date, party: b.supplier_ledger_id, due: Number(b.balance), type: 'bill' as const })),
  ]
  return (
    <>
      <PageHeader title="New payment" description="Pay a supplier, an expense, or a refund to a client" />
      <PaymentForm ledgers={ledgers} open={open} initialParty={sp.party ?? ''} initialDoc={sp.invoice ?? sp.bill ?? ''} today={today()} />
    </>
  )
}
