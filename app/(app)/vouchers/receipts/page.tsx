import Link from 'next/link'
import { getContext } from '@/lib/context'
import { formatAmount, formatINR } from '@/lib/money'
import { fillTemplate, templateFor } from '@/lib/messages'
import { WhatsAppButton } from '@/components/whatsapp-button'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Receipts' }

const MODE: Record<string, string> = { upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque', card: 'Card', gateway: 'Online' }

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams
  const { supabase, org, fy } = await getContext()
  const { data: rows } = await supabase
    .from('vouchers')
    .select('id, voucher_no, voucher_date, amount, mode, reference, cheque_no, party:ledgers!vouchers_party_ledger_id_fkey(id, name, mobile), account:ledgers!vouchers_cash_bank_ledger_id_fkey(name), bill_allocations(amount)')
    .eq('org_id', org.id)
    .eq('fy_id', fy.id)
    .eq('kind', 'receipt')
    .order('voucher_date', { ascending: false })
    .order('voucher_no', { ascending: false })
    .limit(200)
  const total = rows?.reduce((s, r) => s + Number(r.amount), 0) ?? 0
  const { data: tpl } = await supabase.from('message_templates').select('doc_type, body').eq('org_id', org.id).eq('channel', 'whatsapp')
  const receiptText = templateFor(tpl, 'receipt')

  return (
    <>
      <PageHeader title="Receipts" description={`FY ${fy.label}`} actions={<><LinkButton href="/vouchers/import?kind=receipt" variant="outline">Import</LinkButton><LinkButton href="/vouchers/batch?kind=receipt" variant="outline">Batch entry</LinkButton><LinkButton href="/vouchers/receipts/new">New receipt</LinkButton></>} />
      {saved && <p className="mb-4 rounded-2xl bg-primary/10 px-3 py-2 text-sm">Receipt saved and posted to the accounts.</p>}
      {rows?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voucher</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Into</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Adjusted</TableHead>
                <TableHead className="w-10"><span className="sr-only">Share</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const party = r.party as unknown as { id: string; name: string; mobile: string | null } | null
                const adjusted = (r.bill_allocations as { amount: number }[]).reduce((s, a) => s + Number(a.amount), 0)
                return (
                  <TableRow key={r.id} className={r.id === saved ? 'bg-primary/5' : undefined}>
                    <TableCell className="font-medium"><a href={`/vouchers/${r.id}/pdf`} target="_blank" rel="noopener" title="Receipt PDF" className="hover:underline">{r.voucher_no}</a></TableCell>
                    <TableCell>{new Date(r.voucher_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>
                      {party && <Link href={`/accounts/ledger?ledger=${party.id}`} className="hover:underline">{party.name}</Link>}
                    </TableCell>
                    <TableCell>{(r.account as unknown as { name: string } | null)?.name}</TableCell>
                    <TableCell>
                      {MODE[r.mode ?? ''] ?? r.mode}
                      {(r.reference || r.cheque_no) && <span className="block text-xs text-muted-foreground">{r.cheque_no ?? r.reference}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(r.amount)}</TableCell>
                    <TableCell className="text-right">
                      {adjusted >= Number(r.amount) ? <Badge variant="secondary">Fully</Badge> : <span className="tabular-nums">{formatAmount(adjusted)}</span>}
                    </TableCell>
                    <TableCell>
                      <WhatsAppButton size="icon-sm" phone={party?.mobile} text={fillTemplate(receiptText, { client: party?.name, doc_no: r.voucher_no, date: new Date(r.voucher_date).toLocaleDateString('en-IN', { dateStyle: 'medium' }), amount: formatINR(r.amount), company: org.name })} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5}>{rows.length} receipts</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(total)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : (
        <EmptyState>No receipts yet this year.</EmptyState>
      )}
    </>
  )
}
