import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { formatINR, formatAmount } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/form'
import { Input } from '@/components/ui/input'
import { allocate } from '../actions'

export const metadata = { title: 'Adjust voucher' }

/** Spread an amount over bills, oldest first. */
function oldestFirst(amount: number, dues: number[]) {
  const out: number[] = []
  let left = amount
  for (const due of dues) {
    const take = Math.min(left, due)
    out.push(take)
    left -= take
  }
  return out
}

export default async function AdjustVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const { data: v } = await supabase.from('v_unadjusted_vouchers').select('*').eq('org_id', org.id).eq('id', id).maybeSingle()
  if (!v) notFound()
  const { data: p } = await supabase.from('ledgers').select('name, kind').eq('id', v.party_ledger_id).single()
  type Doc = { key: string; no: string; date: string; due: number }
  let docs: Doc[] = []
  if (v.kind === 'receipt') {
    const { data } = await supabase.from('v_invoice_balance').select('id, invoice_no, invoice_date, balance').eq('org_id', org.id).eq('party_ledger_id', v.party_ledger_id).gt('balance', 0).order('invoice_date')
    docs = (data ?? []).map((d) => ({ key: `inv_${d.id}`, no: d.invoice_no, date: d.invoice_date, due: Number(d.balance) }))
  } else if (p?.kind === 'customer') {
    const { data } = await supabase.from('v_invoice_balance').select('id, invoice_no, invoice_date, balance').eq('org_id', org.id).eq('party_ledger_id', v.party_ledger_id).lt('balance', 0).order('invoice_date')
    docs = (data ?? []).map((d) => ({ key: `inv_${d.id}`, no: `Refund on ${d.invoice_no}`, date: d.invoice_date, due: -Number(d.balance) }))
  } else {
    const { data } = await supabase.from('v_purchase_balance').select('id, bill_no, bill_date, balance').eq('org_id', org.id).eq('supplier_ledger_id', v.party_ledger_id).gt('balance', 0).order('bill_date')
    docs = (data ?? []).map((d) => ({ key: `bill_${d.id}`, no: d.bill_no, date: d.bill_date, due: Number(d.balance) }))
  }
  const suggest = oldestFirst(Number(v.unadjusted), docs.map((d) => d.due))

  return (
    <>
      <PageHeader title={`Adjust ${v.voucher_no}`} description={`${p?.name} · ${formatINR(v.unadjusted)} not yet adjusted (oldest bills suggested first)`} />
      {docs.length ? (
        <ActionForm action={allocate} resetOnSuccess={false} className="grid max-w-2xl gap-2">
          <input type="hidden" name="voucher_id" value={v.id} />
          {docs.map((d, i) => (
            <div key={d.key} className="grid grid-cols-[1fr_auto_140px] items-center gap-3 text-sm">
              <span>{d.no} <span className="text-muted-foreground">· {new Date(d.date).toLocaleDateString('en-IN')}</span></span>
              <span className="text-muted-foreground tabular-nums">due {formatAmount(d.due)}</span>
              <Input name={d.key} aria-label={`Amount against ${d.no}`} inputMode="decimal" className="text-right tabular-nums" defaultValue={suggest[i] ? (suggest[i] / 100).toFixed(2) : ''} />
            </div>
          ))}
          <div className="pt-2"><SubmitButton>Save adjustment</SubmitButton></div>
        </ActionForm>
      ) : (
        <p className="text-sm text-muted-foreground">This party has no open bills to adjust against.</p>
      )}
    </>
  )
}
