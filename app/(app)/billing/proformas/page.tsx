import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Proformas' }

export default async function ProformasPage() {
  const { supabase, org, fy } = await getContext()
  const { data: rows } = await supabase
    .from('invoices')
    .select('id, invoice_no, invoice_date, bill_type, total, party:ledgers!invoices_party_ledger_id_fkey(name), conv:converted_to_invoice_id(id, invoice_no), quote:quotation_id(id, quote_no)')
    .eq('org_id', org.id)
    .eq('fy_id', fy.id)
    .eq('doc_kind', 'proforma')
    .order('invoice_date', { ascending: false })
    .limit(200)
  return (
    <>
      <PageHeader title="Proforma invoices" description={`Advance bills that become invoices when the booking is confirmed · FY ${fy.label}`} actions={<LinkButton href="/billing/proformas/new">New proforma</LinkButton>} />
      {rows?.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Proforma</TableHead><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Type</TableHead><TableHead>Quotation</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const conv = r.conv as unknown as { id: string; invoice_no: string } | null
                const quote = r.quote as unknown as { id: string; quote_no: string } | null
                return (
                  <TableRow key={r.id}>
                    <TableCell><Link href={`/billing/invoices/${r.id}`} className="font-medium hover:underline">{r.invoice_no}</Link></TableCell>
                    <TableCell>{new Date(r.invoice_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{(r.party as unknown as { name: string }).name}</TableCell>
                    <TableCell className="capitalize">{r.bill_type.replace('_', ' ')}</TableCell>
                    <TableCell>{quote && <Link href={`/crm/quotations/${quote.id}`} className="hover:underline">{quote.quote_no}</Link>}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(r.total)}</TableCell>
                    <TableCell>{conv ? <Link href={`/billing/invoices/${conv.id}`}><Badge>{conv.invoice_no}</Badge></Link> : <Badge variant="outline">open</Badge>}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No proformas yet. Make one from a quotation, or start a blank one.</EmptyState>
      )}
    </>
  )
}
