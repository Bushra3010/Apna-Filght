import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { CsvButton } from '@/components/csv-button'

export const metadata = { title: 'Open bills' }

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ party?: string; side?: string }> }) {
  const { party, side } = await searchParams
  if (!party) notFound()
  const { supabase, org } = await getContext()
  const { data: l } = await supabase.from('ledgers').select('id, name, kind, credit_days').eq('org_id', org.id).eq('id', party).maybeSingle()
  if (!l) notFound()
  const payable = side === 'payable' || l.kind === 'supplier'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  type Bill = { id: string; no: string; date: string; due: string | null; total: number; balance: number; href: string }
  let bills: Bill[] = []
  if (payable) {
    const { data } = await supabase.from('v_purchase_balance').select('id, bill_no, supplier_bill_no, bill_date, total, balance').eq('org_id', org.id).eq('supplier_ledger_id', party).gt('balance', 0).order('bill_date')
    bills = (data ?? []).map((b) => ({ id: b.id, no: b.supplier_bill_no ? `${b.bill_no} (${b.supplier_bill_no})` : b.bill_no, date: b.bill_date, due: null, total: Number(b.total), balance: Number(b.balance), href: `/purchase/general/${b.id}` }))
  } else {
    const { data } = await supabase.from('v_invoice_balance').select('id, invoice_no, invoice_date, due_date, total, balance').eq('org_id', org.id).eq('party_ledger_id', party).neq('balance', 0).order('invoice_date')
    bills = (data ?? []).map((b) => ({ id: b.id, no: b.invoice_no, date: b.invoice_date, due: b.due_date, total: Number(b.total), balance: Number(b.balance), href: `/billing/invoices/${b.id}` }))
  }
  const age = (b: Bill) => Math.floor((Date.parse(today) - Date.parse(b.due ?? b.date)) / 86400000)
  const total = bills.reduce((s, b) => s + b.balance, 0)

  return (
    <>
      <PageHeader
        title={`Open bills · ${l.name}`}
        description={payable ? 'Purchase bills not yet fully paid' : 'Invoices not fully received (negative = refund due)'}
        actions={<><CsvButton tableId="bills" filename={`bills-${l.name}`} /><LinkButton href={payable ? `/vouchers/payments/new?party=${l.id}` : `/vouchers/receipts/new?party=${l.id}`}>{payable ? 'Pay' : 'Receive'}</LinkButton></>}
      />
      {bills.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <table id="bills" className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 text-left font-medium">Bill</th><th className="px-3 py-2 text-left font-medium">Date</th><th className="px-3 py-2 text-left font-medium">Due</th><th className="px-3 py-2 text-right font-medium">Age (days)</th><th className="px-3 py-2 text-right font-medium">Bill amount</th><th className="px-3 py-2 text-right font-medium">Balance</th></tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-3 py-2"><Link href={b.href} className="font-medium hover:underline">{b.no}</Link></td>
                  <td className="px-3 py-2">{new Date(b.date).toLocaleDateString('en-IN')}</td>
                  <td className="px-3 py-2">{b.due ? new Date(b.due).toLocaleDateString('en-IN') : '—'}</td>
                  <td className={age(b) > 60 ? 'px-3 py-2 text-right text-destructive tabular-nums' : 'px-3 py-2 text-right tabular-nums'}>{Math.max(age(b), 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatAmount(b.total)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatAmount(b.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t font-semibold"><tr><td className="px-3 py-2" colSpan={5}>Total</td><td className="px-3 py-2 text-right tabular-nums">{formatAmount(total)}</td></tr></tfoot>
          </table>
        </div>
      ) : (
        <EmptyState>No open bills.</EmptyState>
      )}
    </>
  )
}
