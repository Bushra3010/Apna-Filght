import { getContext } from '@/lib/context'
import { PageHeader } from '@/components/page-header'
import { HotelVoucherForm, type HotelVoucherDraft } from '../voucher-form'
import { getVoucherOptions } from '../data'

export const metadata = { title: 'New hotel voucher' }

export default async function Page({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const { invoice } = await searchParams
  const { supabase, org } = await getContext()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const v: HotelVoucherDraft = {
    id: '', kind: 'hotel', voucher_date: today, party_ledger_id: '', invoice_id: '', hotel_id: '', property_name: '', guest_name: '',
    other_guests: '', adults: '2', children: '0', check_in: '', check_out: '', rooms: '1', room_type: '', meal_plan: '', confirmation_no: '',
    contact: '', inclusions: '', notes: '',
  }
  let from = ''
  if (invoice) {
    const { data: inv } = await supabase.from('invoices').select('id, invoice_no, party_ledger_id').eq('org_id', org.id).eq('id', invoice).maybeSingle()
    const { data: line } = inv ? await supabase.from('invoice_lines').select('*').eq('invoice_id', inv.id).eq('service', 'hotel').order('sort').limit(1).maybeSingle() : { data: null }
    if (inv) {
      from = `For invoice ${inv.invoice_no}`
      v.invoice_id = inv.id
      v.party_ledger_id = inv.party_ledger_id
      if (line) {
        const d = (line.details ?? {}) as Record<string, string>
        Object.assign(v, {
          property_name: d.hotel ?? '', guest_name: line.pax_name ?? '', check_in: line.travel_date ?? '', check_out: line.return_date ?? '',
          rooms: d.rooms ?? '1', room_type: d.room_type ?? '', meal_plan: d.meal_plan ?? '', confirmation_no: line.ticket_no ?? '',
        })
      }
    }
  }
  return (
    <>
      <PageHeader title="New hotel / cruise voucher" description={from || 'The confirmation your guest shows at check-in'} />
      <HotelVoucherForm v={v} {...await getVoucherOptions()} />
    </>
  )
}
