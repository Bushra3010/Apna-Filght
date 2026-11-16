import 'server-only'
import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatAmount } from '@/lib/money'
import { EmptyState } from '@/components/page-header'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const MODE: Record<string, string> = { upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque', card: 'Card', gateway: 'Online', adjustment: '—' }

export async function VoucherList({ kind, saved }: { kind: 'payment' | 'contra' | 'journal'; saved?: string }) {
  const { supabase, org, fy } = await getContext()
  const { data: rows } = await supabase
    .from('vouchers')
    .select('id, voucher_no, voucher_date, amount, mode, reference, cheque_no, narration, party:ledgers!vouchers_party_ledger_id_fkey(id, name), account:ledgers!vouchers_cash_bank_ledger_id_fkey(id, name), voucher_lines(debit, credit, ledgers(name))')
    .eq('org_id', org.id)
    .eq('fy_id', fy.id)
    .eq('kind', kind)
    .order('voucher_date', { ascending: false })
    .order('voucher_no', { ascending: false })
    .limit(200)
  const total = rows?.reduce((s, r) => s + Number(r.amount), 0) ?? 0
  if (!rows?.length) return <EmptyState>No {kind} entries this year.</EmptyState>

  const toLabel = kind === 'payment' ? 'Paid to' : kind === 'contra' ? 'To' : 'Debit'
  const fromLabel = kind === 'payment' ? 'From' : kind === 'contra' ? 'From' : 'Credit'
  type L = { debit: number; credit: number; ledgers: { name: string } | null }

  return (
    <>
      {saved && <p className="mb-4 rounded-lg bg-primary/10 px-3 py-2 text-sm">Saved and posted to the accounts.</p>}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>{toLabel}</TableHead>
              <TableHead>{fromLabel}</TableHead>
              {kind !== 'journal' && <TableHead>Mode</TableHead>}
              <TableHead>Narration</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const party = r.party as unknown as { id: string; name: string } | null
              const account = r.account as unknown as { id: string; name: string } | null
              const lines = (r.voucher_lines ?? []) as unknown as L[]
              const dr = kind === 'journal' ? lines.filter((l) => l.debit > 0).map((l) => l.ledgers?.name).join(', ') : null
              const cr = kind === 'journal' ? lines.filter((l) => l.credit > 0).map((l) => l.ledgers?.name).join(', ') : null
              return (
                <TableRow key={r.id} className={r.id === saved ? 'bg-primary/5' : undefined}>
                  <TableCell className="font-medium">{r.voucher_no}</TableCell>
                  <TableCell>{new Date(r.voucher_date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{dr ?? (party && <Link href={`/accounts/ledger?ledger=${party.id}`} className="hover:underline">{party.name}</Link>)}</TableCell>
                  <TableCell>{cr ?? account?.name}</TableCell>
                  {kind !== 'journal' && (
                    <TableCell>
                      {MODE[r.mode ?? ''] ?? r.mode}
                      {(r.reference || r.cheque_no) && <span className="block text-xs text-muted-foreground">{r.cheque_no ?? r.reference}</span>}
                    </TableCell>
                  )}
                  <TableCell className="max-w-56 truncate">{r.narration}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(r.amount)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={kind === 'journal' ? 5 : 6}>{rows.length} entries</TableCell>
              <TableCell className="text-right tabular-nums">{formatAmount(total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  )
}
