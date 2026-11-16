import Link from 'next/link'
import { getContext } from '@/lib/context'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Hotel vouchers' }

export default async function Page() {
  const { supabase, org, fy } = await getContext()
  const { data: rows } = await supabase
    .from('hotel_vouchers')
    .select('id, voucher_no, voucher_date, kind, property_name, guest_name, check_in, check_out, rooms, room_type, party:ledgers!hotel_vouchers_party_ledger_id_fkey(name)')
    .eq('org_id', org.id)
    .eq('fy_id', fy.id)
    .order('check_in', { ascending: false })
    .limit(200)
  return (
    <>
      <PageHeader title="Hotel / cruise vouchers" description={`FY ${fy.label}`} actions={<LinkButton href="/billing/hotel-vouchers/new">New voucher</LinkButton>} />
      {rows?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Voucher</TableHead><TableHead>Property</TableHead><TableHead>Guest</TableHead><TableHead>Client</TableHead><TableHead>Stay</TableHead><TableHead>Rooms</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/billing/hotel-vouchers/${r.id}`} className="font-medium hover:underline">{r.voucher_no}</Link><span className="block text-xs text-muted-foreground capitalize">{r.kind}</span></TableCell>
                  <TableCell>{r.property_name}</TableCell>
                  <TableCell>{r.guest_name}</TableCell>
                  <TableCell>{(r.party as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(r.check_in).toLocaleDateString('en-IN')} – {new Date(r.check_out).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell>{r.rooms}{r.room_type && ` × ${r.room_type}`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No vouchers yet. Create one from a hotel invoice or start a blank one.</EmptyState>
      )}
    </>
  )
}
