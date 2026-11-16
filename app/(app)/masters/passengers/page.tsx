import Link from 'next/link'
import { getContext } from '@/lib/context'
import { todayIST } from '@/lib/dates'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const metadata = { title: 'Passengers' }

/** Passports expiring within ~6 months are flagged (most countries require 6 months' validity). */
function expiryWarningDate() {
  const [y, m, d] = todayIST().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + 6, d)).toISOString().slice(0, 10)
}

export default async function PassengersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const { supabase, org } = await getContext()
  let query = supabase
    .from('passengers')
    .select('id, title, first_name, last_name, mobile, passport_no, passport_expiry, party:ledgers!passengers_party_ledger_id_fkey(name)')
    .eq('org_id', org.id)
    .order('first_name')
    .limit(200)
  if (q) {
    const s = q.replace(/[,()]/g, ' ')
    query = query.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,mobile.ilike.%${s}%,passport_no.ilike.%${s}%`)
  }
  const { data: rows } = await query
  const soon = expiryWarningDate()

  return (
    <>
      <PageHeader title="Passengers" description="Names auto-suggest on invoices" actions={<LinkButton href="/masters/passengers/new">New passenger</LinkButton>} />
      <form className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Name, mobile or passport" className="max-w-xs" />
        <button className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">Search</button>
      </form>
      {rows?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Client / group</TableHead><TableHead>Mobile</TableHead><TableHead>Passport</TableHead><TableHead>Expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/masters/passengers/${r.id}`} className="font-medium hover:underline">{[r.title, r.first_name, r.last_name].filter(Boolean).join(' ')}</Link></TableCell>
                  <TableCell>{(r.party as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell>{r.mobile}</TableCell>
                  <TableCell className="font-mono text-xs">{r.passport_no}</TableCell>
                  <TableCell>
                    {r.passport_expiry && (
                      r.passport_expiry < soon
                        ? <Badge variant="destructive">{new Date(r.passport_expiry).toLocaleDateString('en-IN')}</Badge>
                        : new Date(r.passport_expiry).toLocaleDateString('en-IN')
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No passengers yet.</EmptyState>
      )}
    </>
  )
}
