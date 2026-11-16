import { notFound } from 'next/navigation'
import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { HotelVoucherForm } from '../../voucher-form'
import { getVoucherOptions } from '../../data'

export const metadata = { title: 'Edit hotel voucher' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, org } = await getContext()
  const { data: h } = await supabase.from('hotel_vouchers').select('*').eq('org_id', org.id).eq('id', id).maybeSingle()
  if (!h) notFound()
  const s = (x: unknown) => (x === null || x === undefined ? '' : String(x))
  return (
    <>
      <PageHeader title={`Edit ${h.voucher_no}`} />
      <HotelVoucherForm
        v={{
          id: h.id, kind: h.kind, voucher_date: h.voucher_date, party_ledger_id: s(h.party_ledger_id), invoice_id: s(h.invoice_id), hotel_id: s(h.hotel_id),
          property_name: h.property_name, guest_name: h.guest_name, other_guests: ((h.guests ?? []) as string[]).join('\n'), adults: s(h.adults),
          children: s(h.children), check_in: h.check_in, check_out: h.check_out, rooms: s(h.rooms), room_type: s(h.room_type), meal_plan: s(h.meal_plan),
          confirmation_no: s(h.confirmation_no), contact: s(h.contact), inclusions: s(h.inclusions), notes: s(h.notes),
        }}
        {...await getVoucherOptions()}
      />
    </>
  )
}
