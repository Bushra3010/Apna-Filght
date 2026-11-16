import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { formatAmount, formatINR } from '@/lib/money'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Purchase bill' }

export default async function PurchaseBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: b }, { data: lines }, { data: bal }] = await Promise.all([
    supabase.from('purchase_bills').select('*, supplier:ledgers!purchase_bills_supplier_ledger_id_fkey(name, gstin)').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('purchase_bill_lines').select('*, ledgers(name)').eq('purchase_bill_id', id).order('sort'),
    supabase.from('v_purchase_balance').select('paid, balance').eq('id', id).maybeSingle(),
  ])
  if (!b) notFound()
  const supplier = b.supplier as unknown as { name: string; gstin: string | null }
  const due = Number(bal?.balance ?? 0)

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{b.bill_no}</h1>
          <Badge variant={due === 0 ? 'default' : 'outline'}>{due === 0 ? 'paid' : Number(bal?.paid ?? 0) > 0 ? 'partial' : 'unpaid'}</Badge>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`/purchase/general/${b.id}/edit`} variant="outline">Edit</LinkButton>
          {due > 0 && <LinkButton href={`/vouchers/payments/new?party=${b.supplier_ledger_id}&bill=${b.id}`}>Pay {formatINR(due)}</LinkButton>}
        </div>
      </div>
      <div className="grid max-w-4xl gap-4 rounded-3xl bg-card p-6 text-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-muted-foreground">Supplier</p><p className="font-medium">{supplier.name}</p>{supplier.gstin && <p className="font-mono text-xs">{supplier.gstin}</p>}</div>
          <div><p className="text-xs text-muted-foreground">Bill date</p><p>{new Date(b.bill_date).toLocaleDateString('en-IN')}</p></div>
          <div><p className="text-xs text-muted-foreground">Supplier&apos;s bill</p><p>{b.supplier_bill_no ?? '—'}{b.supplier_bill_date && ` · ${new Date(b.supplier_bill_date).toLocaleDateString('en-IN')}`}</p></div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2">Account</th><th className="py-2">Description</th><th className="py-2 text-right">Taxable</th><th className="py-2 text-right">GST</th><th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines?.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="py-2">{(l.ledgers as unknown as { name: string }).name}</td>
                <td className="py-2">{l.description}</td>
                <td className="py-2 text-right tabular-nums">{formatAmount(l.taxable)}</td>
                <td className="py-2 text-right tabular-nums">{formatAmount(l.cgst + l.sgst + l.igst)} <span className="text-xs text-muted-foreground">@{Number(l.gst_rate)}%</span></td>
                <td className="py-2 text-right tabular-nums">{formatAmount(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="grid max-w-xs gap-1 justify-self-end">
          {Number(b.tds) > 0 && <div className="flex justify-between gap-6"><dt className="text-muted-foreground">Less TDS</dt><dd className="tabular-nums">−{formatAmount(b.tds)}</dd></div>}
          <div className="flex justify-between gap-6 font-semibold"><dt>Payable</dt><dd className="tabular-nums">{formatINR(b.total)}</dd></div>
          <div className="flex justify-between gap-6"><dt className="text-muted-foreground">Paid</dt><dd className="tabular-nums">{formatAmount(bal?.paid ?? 0)}</dd></div>
        </dl>
        {b.notes && <p className="whitespace-pre-line text-muted-foreground">{b.notes}</p>}
      </div>
    </>
  )
}
