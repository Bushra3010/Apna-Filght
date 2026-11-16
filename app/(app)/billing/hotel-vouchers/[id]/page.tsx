import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { LinkButton } from '@/components/link-button'
import { PrintButton } from '@/components/print-button'

export const metadata = { title: 'Hotel voucher' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const [{ data: h }, { data: company }] = await Promise.all([
    supabase.from('hotel_vouchers').select('*, invoices(id, invoice_no), hotels(address, cities(name))').eq('org_id', org.id).eq('id', id).maybeSingle(),
    supabase.from('orgs').select('name, legal_name, address_line1, address_line2, mobile, email').eq('id', org.id).single(),
  ])
  if (!h) notFound()
  const inv = h.invoices as unknown as { id: string; invoice_no: string } | null
  const hotel = h.hotels as unknown as { address: string | null; cities: { name: string } | null } | null
  const nights = Math.round((new Date(h.check_out).getTime() - new Date(h.check_in).getTime()) / 86400000)
  const dt = (v: string) => new Date(v).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const guests = (h.guests ?? []) as string[]

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{h.voucher_no}</h1>
          {inv && <Link href={`/billing/invoices/${inv.id}`} className="text-sm text-muted-foreground underline">{inv.invoice_no}</Link>}
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <LinkButton href={`/billing/hotel-vouchers/${h.id}/edit`} variant="outline">Edit</LinkButton>
        </div>
      </div>
      <article className="mx-auto grid max-w-3xl gap-5 rounded-xl border bg-white p-8 text-sm text-neutral-900 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-lg font-semibold">{company?.legal_name || company?.name}</p>
            <p>{[company?.address_line1, company?.address_line2].filter(Boolean).join(', ')}</p>
            <p>{[company?.mobile, company?.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-wide">{h.kind === 'cruise' ? 'CRUISE VOUCHER' : 'HOTEL VOUCHER'}</p>
            <p>No. {h.voucher_no}</p>
            <p>{new Date(h.voucher_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
          </div>
        </header>
        <section>
          <p className="text-xs text-neutral-500 uppercase">{h.kind === 'cruise' ? 'Cruise' : 'Hotel'}</p>
          <p className="text-lg font-semibold">{h.property_name}</p>
          {(hotel?.address || hotel?.cities?.name) && <p className="text-neutral-600">{[hotel?.address, hotel?.cities?.name].filter(Boolean).join(', ')}</p>}
          {h.contact && <p className="text-neutral-600">{h.contact}</p>}
        </section>
        <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <div><p className="text-xs text-neutral-500">Check-in</p><p className="font-medium">{dt(h.check_in)}</p></div>
          <div><p className="text-xs text-neutral-500">Check-out</p><p className="font-medium">{dt(h.check_out)}</p></div>
          <div><p className="text-xs text-neutral-500">Nights</p><p className="font-medium">{nights}</p></div>
          <div><p className="text-xs text-neutral-500">{h.kind === 'cruise' ? 'Cabins' : 'Rooms'}</p><p className="font-medium">{h.rooms}{h.room_type && ` × ${h.room_type}`}</p></div>
          <div><p className="text-xs text-neutral-500">Meal plan</p><p className="font-medium">{h.meal_plan || '—'}</p></div>
          <div><p className="text-xs text-neutral-500">Confirmation</p><p className="font-mono font-medium">{h.confirmation_no || '—'}</p></div>
        </section>
        <section>
          <p className="text-xs text-neutral-500 uppercase">Guests · {h.adults} adult(s){h.children ? `, ${h.children} child(ren)` : ''}</p>
          <ol className="list-decimal pl-5">
            <li className="font-medium">{h.guest_name}</li>
            {guests.map((g, i) => <li key={i}>{g}</li>)}
          </ol>
        </section>
        {h.inclusions && <section><p className="text-xs text-neutral-500 uppercase">Inclusions</p><p className="whitespace-pre-line">{h.inclusions}</p></section>}
        {h.notes && <section><p className="text-xs text-neutral-500 uppercase">Notes</p><p className="whitespace-pre-line">{h.notes}</p></section>}
        <p className="border-t pt-4 text-xs text-neutral-500">Please present this voucher at check-in. Services are prepaid as listed above; extras are payable directly.</p>
      </article>
    </>
  )
}
