import Link from 'next/link'
import { getContext } from '@/lib/context'
import { PageHeader, EmptyState } from '@/components/page-header'
import { LinkButton } from '@/components/link-button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LEDGER_KINDS } from '@/lib/ledgers'

export const metadata = { title: 'Ledgers' }

export default async function LedgersPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { q = '', kind = '' } = await searchParams
  const { supabase, org } = await getContext()
  let query = supabase
    .from('ledgers')
    .select('id, name, kind, gstin, mobile, system_key, account_groups(name), states(name)')
    .eq('org_id', org.id)
    .order('name')
    .limit(200)
  if (q) query = query.ilike('name', `%${q}%`)
  if (kind) query = query.eq('kind', kind)
  else query = query.is('system_key', null)
  const { data: ledgers } = await query

  return (
    <>
      <PageHeader
        title="Ledgers"
        description="Clients, suppliers, bank and cash accounts"
        actions={<LinkButton href="/masters/ledgers/new">New ledger</LinkButton>}
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search by name" className="max-w-xs" />
        <select name="kind" defaultValue={kind} className="h-10 rounded-xl border border-input bg-muted px-3 text-sm">
          <option value="">Your ledgers</option>
          {LEDGER_KINDS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
          <option value="tax">Tax (system)</option>
        </select>
        <button className="h-10 rounded-full border border-border bg-secondary px-4 text-sm font-semibold hover:bg-accent">Filter</button>
      </form>
      {ledgers?.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgers.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.system_key ? l.name : <Link href={`/masters/ledgers/${l.id}`} className="hover:underline">{l.name}</Link>}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{l.kind}</Badge></TableCell>
                  <TableCell>{(l.account_groups as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell className="font-mono text-xs">{l.gstin}</TableCell>
                  <TableCell>{(l.states as unknown as { name: string } | null)?.name}</TableCell>
                  <TableCell>{l.mobile}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/accounts/ledger?ledger=${l.id}`} className="text-xs text-primary hover:underline">Statement</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState>No ledgers yet. Add your first client, supplier and bank account.</EmptyState>
      )}
    </>
  )
}
