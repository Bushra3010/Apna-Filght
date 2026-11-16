import Link from 'next/link'
import { getContext } from '@/lib/context'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Hotels' }

export default async function HotelsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const { supabase, org } = await getContext()
  let query = supabase.from('hotels').select('id, name, star_rating, contact_name, mobile, cities(name), hotel_rates(count)').eq('org_id', org.id).order('name').limit(300)
  if (q) query = query.ilike('name', `%${q.replace(/[%,()]/g, ' ')}%`)
  const { data: rows } = await query
  return (
    <>
      <PageHeader title="Hotels" description="Hotels and their room rates, used to price quotations" actions={<LinkButton href="/crm/hotels/new">New hotel</LinkButton>} />
      <form className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Search hotels" className="max-w-xs" />
        <button className="h-8 rounded-lg border px-3 text-sm hover:bg-muted">Search</button>
      </form>
      {rows?.length ? (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader><TableRow><TableHead>Hotel</TableHead><TableHead>City</TableHead><TableHead>Stars</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Rates</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/crm/hotels/${r.id}`} className="font-medium hover:underline">{r.name}</Link></TableCell>
                  <TableCell>{(r.cities as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell>{r.star_rating ? `${r.star_rating}★` : ''}</TableCell>
                  <TableCell>{[r.contact_name, r.mobile].filter(Boolean).join(' · ')}</TableCell>
                  <TableCell className="text-right tabular-nums">{(r.hotel_rates as unknown as { count: number }[])[0]?.count ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No hotels yet.</EmptyState>
      )}
    </>
  )
}
