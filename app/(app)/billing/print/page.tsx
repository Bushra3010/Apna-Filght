import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { Field, NativeSelect } from '@/components/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export const metadata = { title: 'Print in bulk' }

export default async function BulkPrintPage() {
  const { supabase, org, fy } = await getContext()
  const { data: clients } = await supabase.from('ledgers').select('id, name').eq('org_id', org.id).eq('kind', 'customer').eq('is_active', true).order('name')
  return (
    <>
      <PageHeader title="Print in bulk" description="One PDF with every invoice, credit note or proforma in a date range (up to 150 at a time), ready to print or send to your accountant." />
      <form action="/billing/print/pdf" method="get" target="_blank" className="grid max-w-3xl gap-4 rounded-3xl bg-card p-5 sm:grid-cols-2 md:p-6">
        <Field label="From" htmlFor="from"><Input id="from" name="from" type="date" defaultValue={fy.starts_on} min={fy.starts_on} max={fy.ends_on} required /></Field>
        <Field label="To" htmlFor="to"><Input id="to" name="to" type="date" defaultValue={fy.ends_on} min={fy.starts_on} max={fy.ends_on} required /></Field>
        <Field label="Documents" htmlFor="kind">
          <NativeSelect id="kind" name="kind" defaultValue="invoice">
            <option value="invoice">Invoices</option>
            <option value="credit_note">Credit notes</option>
            <option value="proforma">Proforma invoices</option>
          </NativeSelect>
        </Field>
        <Field label="Client (optional)" htmlFor="party">
          <NativeSelect id="party" name="party" defaultValue="">
            <option value="">All clients</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit"><Printer /> Open PDF</Button>
          <Button type="submit" variant="outline" name="download" value="1">Download</Button>
        </div>
      </form>
    </>
  )
}
