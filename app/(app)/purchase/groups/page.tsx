import Link from 'next/link'
import { getContext } from '@/lib/context'
import { todayIST } from '@/lib/dates'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Group purchases' }

export default async function GroupsPage() {
  const { supabase, org, fy } = await getContext()
  const today = todayIST()
  const { data: rows } = await supabase.from('v_group_purchase').select('*').eq('org_id', org.id).eq('fy_id', fy.id).order('travel_date', { ascending: false })
  return (
    <>
      <PageHeader title="Group / FD purchases" description="Seats bought in blocks; sell them from flight invoices with “Seat from group”" actions={<LinkButton href="/purchase/groups/new">New group</LinkButton>} />
      {rows?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Group</TableHead><TableHead>Travel</TableHead><TableHead>Sector / PNR</TableHead><TableHead className="text-right">Seats</TableHead><TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Left</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Profit</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((g) => (
                <TableRow key={g.id}>
                  <TableCell><Link href={`/purchase/groups/${g.id}`} className="font-semibold hover:underline">{g.bill_no}</Link></TableCell>
                  <TableCell>{g.travel_date && new Date(g.travel_date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{[g.sector, g.pnr].filter(Boolean).join(' · ')}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.seats}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.sold}</TableCell>
                  <TableCell className={cn('text-right font-semibold tabular-nums', g.left_seats > 0 && g.travel_date && g.travel_date < today && 'text-destructive')}>{g.left_seats}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(g.taxable)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(g.revenue)}</TableCell>
                  <TableCell className={cn('text-right font-semibold tabular-nums', Number(g.profit) < 0 && 'text-destructive')}>{formatAmount(g.profit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No group purchases yet.</EmptyState>
      )}
    </>
  )
}
