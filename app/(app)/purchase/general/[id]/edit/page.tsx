import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { paiseToInput } from '@/lib/money'
import { PurchaseForm } from '../../purchase-form'
import { getPurchaseOptions } from '../../data'

export const metadata = { title: 'Edit purchase bill' }

export default async function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: b }, { data: lines }, opts] = await Promise.all([
    supabase.from('purchase_bills').select('*').eq('org_id', org.id).eq('id', id).eq('kind', 'general').maybeSingle(),
    supabase.from('purchase_bill_lines').select('*').eq('purchase_bill_id', id).order('sort'),
    getPurchaseOptions(),
  ])
  if (!b || b.status === 'cancelled') notFound()
  return (
    <>
      <PageHeader title={`Edit ${b.bill_no}`} description="Saving re-posts the bill to the accounts." />
      <PurchaseForm
        draft={{
          id: b.id,
          supplier_ledger_id: b.supplier_ledger_id,
          bill_date: b.bill_date,
          supplier_bill_no: b.supplier_bill_no ?? '',
          supplier_bill_date: b.supplier_bill_date ?? '',
          place_of_supply_state_id: b.place_of_supply_state_id ?? '',
          tds: paiseToInput(b.tds),
          notes: b.notes ?? '',
          lines: (lines ?? []).map((l) => ({ ledger_id: l.ledger_id, description: l.description ?? '', taxable: paiseToInput(l.taxable), gst_rate: String(Number(l.gst_rate)) })),
        }}
        {...opts}
      />
    </>
  )
}
