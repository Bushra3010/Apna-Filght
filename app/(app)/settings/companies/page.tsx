import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { ActionForm } from '@/components/action-form'
import { Field, NativeSelect, SubmitButton } from '@/components/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { addCompany, switchCompany } from './actions'

export const metadata = { title: 'Companies' }

export default async function CompaniesPage() {
  const { supabase, org, companies } = await getContext()
  const { data: states } = await supabase.from('states').select('gst_code, name').not('gst_code', 'is', null).order('name')
  const now = new Date()
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return (
    <>
      <PageHeader title="Companies" description="Each company has its own books, numbering, GST returns and team" />
      <div className="grid max-w-3xl gap-6">
        <section className="grid gap-3">
          {companies.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-3xl bg-card p-5">
              <p className="flex items-center gap-2 font-semibold">{c.name}{c.id === org.id && <Badge>current</Badge>}</p>
              {c.id !== org.id && (
                <form action={switchCompany}>
                  <input type="hidden" name="org" value={c.id} />
                  <Button type="submit" variant="outline" size="sm">Switch to this company</Button>
                </form>
              )}
            </div>
          ))}
        </section>
        <ActionForm action={addCompany} resetOnSuccess={false} className="grid gap-4 rounded-3xl bg-card p-6 sm:grid-cols-3">
          <h2 className="text-xl font-bold tracking-tight sm:col-span-3">Add a company</h2>
          <Field label="Company name" htmlFor="name" required><Input id="name" name="name" required /></Field>
          <Field label="State" htmlFor="state" required>
            <NativeSelect id="state" name="state" defaultValue="" required>
              <option value="" disabled>Select state</option>
              {(states ?? []).map((s) => <option key={s.gst_code} value={s.gst_code}>{s.gst_code} – {s.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Financial year starts" htmlFor="fy_start" required><Input id="fy_start" name="fy_start" type="date" defaultValue={`${fyYear}-04-01`} required /></Field>
          <div className="sm:col-span-3"><SubmitButton>Create and switch</SubmitButton></div>
        </ActionForm>
      </div>
    </>
  )
}
