import { PageHeader } from '@/components/page-header'
import { PurchaseForm } from '../purchase-form'
import { blankPLine } from '@/lib/purchase'
import { getPurchaseOptions } from '../data'

export const metadata = { title: 'New purchase bill' }

export default async function NewPurchasePage() {
  const opts = await getPurchaseOptions()
  return (
    <>
      <PageHeader title="New purchase bill" description="Rent, utilities, software, office supplies and other expenses" />
      <PurchaseForm
        draft={{
          supplier_ledger_id: '',
          bill_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
          supplier_bill_no: '',
          supplier_bill_date: '',
          place_of_supply_state_id: opts.orgStateId ?? '',
          tds: '',
          notes: '',
          lines: [blankPLine()],
        }}
        {...opts}
      />
    </>
  )
}
