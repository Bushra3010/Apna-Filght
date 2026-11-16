import Link from 'next/link'
import { getContext } from '@/lib/context'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Itineraries' }

export default async function Page() {
  const { supabase, org } = await getContext()
  const { data: rows } = await supabase
    .from('itineraries')
    .select('id, title, nights, routes(name), ptitle:lookups!itineraries_package_title_id_fkey(name), itinerary_days(count)')
    .eq('org_id', org.id)
    .order('title')
  return (
    <>
      <PageHeader title="Itineraries" description="Reusable day-wise plans" actions={<LinkButton href="/crm/itineraries/new">New itinerary</LinkButton>} />
      {rows?.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Itinerary</TableHead><TableHead>Route</TableHead><TableHead>Package</TableHead><TableHead>Duration</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/crm/itineraries/${r.id}`} className="font-medium hover:underline">{r.title}</Link></TableCell>
                  <TableCell>{(r.routes as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell>{(r.ptitle as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell>{r.nights}N / {(r.itinerary_days as unknown as { count: number }[])[0]?.count ?? 0} days</TableCell>
                  <TableCell className="text-right"><Link href={`/crm/quotations/new?itinerary=${r.id}`} className="text-xs text-primary hover:underline">Quote</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No itineraries yet.</EmptyState>
      )}
    </>
  )
}
