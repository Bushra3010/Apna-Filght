import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Purchase bills' }

export default async function PurchasesPage() {
  const { supabase, org, fy } = await getContext()
  const { data: rows } = await supabase
    .from('v_purchase_balance')
    .select('id, bill_no, bill_date, supplier_ledger_id, supplier_bill_no, total, paid, balance')
    .eq('org_id', org.id)
    .eq('fy_id', fy.id)
    .eq('kind', 'general')
    .order('bill_date', { ascending: false })
    .limit(200)
  const ids = [...new Set(rows?.map((r) => r.supplier_ledger_id))]
  const { data: sup } = ids.length ? await supabase.from('ledgers').select('id, name').in('id', ids) : { data: [] as { id: string; name: string }[] }
  const name = new Map(sup?.map((s) => [s.id, s.name]))
  const sum = (k: 'total' | 'balance') => rows?.reduce((s, r) => s + Number(r[k]), 0) ?? 0

  return (
    <>
      <PageHeader title="Purchase bills" description={`Expenses and general purchases · FY ${fy.label}`} actions={<LinkButton href="/purchase/general/new">New bill</LinkButton>} />
      {rows?.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Supplier bill</TableHead>
                <TableHead className="text-right">Payable</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/purchase/general/${r.id}`} className="font-medium hover:underline">{r.bill_no}</Link></TableCell>
                  <TableCell>{new Date(r.bill_date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{name.get(r.supplier_ledger_id)}</TableCell>
                  <TableCell>{r.supplier_bill_no}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.balance)}</TableCell>
                  <TableCell><Badge variant={Number(r.balance) === 0 ? 'default' : 'outline'}>{Number(r.balance) === 0 ? 'paid' : Number(r.paid) > 0 ? 'partial' : 'unpaid'}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>{rows.length} bills</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(sum('total'))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(sum('balance'))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : (
        <EmptyState>No purchase bills yet. Add an expense account under Ledgers, then record a bill.</EmptyState>
      )}
    </>
  )
}
