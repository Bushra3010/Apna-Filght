import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Credit notes' }

export default async function CreditNotesPage() {
  const { supabase, org, fy } = await getContext()
  const { data: rows } = await supabase
    .from('invoices')
    .select('id, invoice_no, invoice_date, bill_type, total, cancel_charges, party:ledgers!invoices_party_ledger_id_fkey(name), ref:ref_invoice_id(id, invoice_no)')
    .eq('org_id', org.id)
    .eq('fy_id', fy.id)
    .eq('doc_kind', 'credit_note')
    .order('invoice_date', { ascending: false })
    .limit(200)
  const sum = (k: 'total' | 'cancel_charges') => rows?.reduce((s, r) => s + Number(r[k]), 0) ?? 0

  return (
    <>
      <PageHeader title="Credit notes" description={`Cancellations and refunds · FY ${fy.label}. Start one from an invoice with “Cancel / refund”.`} />
      {rows?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Credit note</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Against</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">Refund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const ref = r.ref as unknown as { id: string; invoice_no: string } | null
                return (
                  <TableRow key={r.id}>
                    <TableCell><Link href={`/billing/invoices/${r.id}`} className="font-medium hover:underline">{r.invoice_no}</Link></TableCell>
                    <TableCell>{new Date(r.invoice_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{(r.party as unknown as { name: string }).name}</TableCell>
                    <TableCell>{ref && <Link href={`/billing/invoices/${ref.id}`} className="hover:underline">{ref.invoice_no}</Link>}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(r.cancel_charges)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(r.total)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>{rows.length} credit notes</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(sum('cancel_charges'))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(sum('total'))}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : (
        <EmptyState>No cancellations this year.</EmptyState>
      )}
    </>
  )
}
