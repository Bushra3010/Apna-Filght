import Link from 'next/link'
import { getContext } from '@/lib/context'
import { LOOKUP_KINDS, isLookupKind } from '@/lib/lookups'
import { PageHeader, EmptyState } from '@/components/page-header'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AddLookupForm } from './add-form'
import { updateLookup } from './actions'

export const metadata = { title: 'Lists' }

export default async function ListsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams
  const kind = sp.kind && isLookupKind(sp.kind) ? sp.kind : 'booked_by'
  const meta = LOOKUP_KINDS.find(([k]) => k === kind)!
  const { supabase, org } = await getContext()
  const { data: items } = await supabase.from('lookups').select('id, name, is_active').eq('org_id', org.id).eq('kind', kind).order('is_active', { ascending: false }).order('name')

  return (
    <>
      <PageHeader title="Lists" description="Small pick-lists used across forms" />
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-wrap gap-1 md:flex-col" aria-label="Lists">
          {LOOKUP_KINDS.map(([k, label]) => (
            <Link key={k} href={`/masters/lists?kind=${k}`} className={cn('rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted', k === kind && 'bg-muted font-medium')}>
              {label}
            </Link>
          ))}
        </nav>
        <section className="grid content-start gap-4">
          <div>
            <h2 className="font-medium">{meta[1]}</h2>
            {meta[2] && <p className="text-sm text-muted-foreground">{meta[2]}</p>}
          </div>
          <AddLookupForm kind={kind} label={meta[1]} />
          {items?.length ? (
            <ul className="grid max-w-xl gap-1.5">
              {items.map((it) => (
                <li key={it.id}>
                  <form action={updateLookup} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={it.id} />
                    <Input name="name" defaultValue={it.name} aria-label="Name" className={cn(!it.is_active && 'text-muted-foreground line-through')} />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" name="is_active" defaultChecked={it.is_active} className="size-3.5" /> Active
                    </label>
                    <Button type="submit" variant="outline" size="sm">Save</Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nothing in this list yet.</EmptyState>
          )}
        </section>
      </div>
    </>
  )
}
