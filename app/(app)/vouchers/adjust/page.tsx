import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Bill adjustment' }

export default async function AdjustPage() {
  const { supabase, org } = await getContext()
  const { data: rows } = await supabase.from('v_unadjusted_vouchers').select('id, kind, voucher_no, voucher_date, party_ledger_id, amount, unadjusted').eq('org_id', org.id).order('voucher_date')
  const ids = [...new Set(rows?.map((r) => r.party_ledger_id))]
  const { data: parties } = ids.length ? await supabase.from('ledgers').select('id, name, kind').in('id', ids) : { data: [] as { id: string; name: string; kind: string }[] }
  const party = new Map(parties?.map((p) => [p.id, p]))
  const relevant = (rows ?? []).filter((r) => ['customer', 'supplier'].includes(party.get(r.party_ledger_id)?.kind ?? ''))
  return (
    <>
      <PageHeader title="Bill adjustment" description="Receipts and payments kept on account — match them to bills so ageing and invoice status are right" />
      {relevant.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Voucher</TableHead><TableHead>Date</TableHead><TableHead>Party</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Not adjusted</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {relevant.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.voucher_no}<span className="block text-xs text-muted-foreground capitalize">{r.kind}</span></TableCell>
                  <TableCell>{new Date(r.voucher_date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{party.get(r.party_ledger_id)?.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.amount)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatAmount(r.unadjusted)}</TableCell>
                  <TableCell className="text-right"><Link href={`/vouchers/adjust/${r.id}`} className="text-sm text-primary hover:underline">Adjust</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>Everything is adjusted.</EmptyState>
      )}
    </>
  )
}
