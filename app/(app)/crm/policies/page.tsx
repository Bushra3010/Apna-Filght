import { Trash2 } from 'lucide-react'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { ActionForm } from '@/components/action-form'
import { NativeSelect, SubmitButton } from '@/components/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { deleteRow, savePolicy } from '../masters-actions'

export const metadata = { title: 'Policies' }

type P = { id?: string; kind?: string; name?: string; body?: string }

export default async function PoliciesPage() {
  const { supabase, org } = await getContext()
  const { data: rows } = await supabase.from('policies').select('id, kind, name, body').eq('org_id', org.id).order('kind').order('name')
  const form = (p: P, isNew: boolean) => (
    <ActionForm action={savePolicy} resetOnSuccess={isNew} className="grid gap-2 sm:grid-cols-[160px_1fr]">
      <input type="hidden" name="id" value={p.id ?? ''} />
      <NativeSelect name="kind" aria-label="Type" defaultValue={p.kind ?? 'general'}>
        <option value="general">General policy</option>
        <option value="other">Other policy</option>
      </NativeSelect>
      <Input name="name" aria-label="Policy name" placeholder="e.g. Cancellation policy" defaultValue={p.name} required />
      <Textarea name="body" aria-label="Policy text" rows={4} className="sm:col-span-2" defaultValue={p.body} placeholder="Shown on quotations" />
      <div className="sm:col-span-2"><SubmitButton>{isNew ? 'Add policy' : 'Save'}</SubmitButton></div>
    </ActionForm>
  )
  return (
    <>
      <PageHeader title="Policies" description="Terms, cancellation and payment policies to include in quotations" />
      <div className="grid max-w-3xl gap-4">
        {rows?.map((p) => (
          <div key={p.id} className="relative rounded-xl border p-4">
            {form(p, false)}
            <form action={deleteRow} className="absolute top-3 right-3">
              <input type="hidden" name="table" value="policies" /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value="/crm/policies" />
              <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Delete ${p.name}`}><Trash2 /></Button>
            </form>
          </div>
        ))}
        <div className="rounded-xl border border-dashed p-4">{form({}, true)}</div>
      </div>
    </>
  )
}
