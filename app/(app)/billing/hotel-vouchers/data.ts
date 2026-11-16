import 'server-only'
import { getContext } from '@/lib/context'
import { getParties } from '../../crm/leads/data'

export async function getVoucherOptions() {
  const { supabase, org } = await getContext()
  const [customers, { data: hotels }] = await Promise.all([
    getParties('customer'),
    supabase.from('hotels').select('id, name, phone, mobile').eq('org_id', org.id).order('name'),
  ])
  return { customers, hotels: (hotels ?? []).map((h) => ({ id: h.id, name: h.name, contact: [h.mobile, h.phone].filter(Boolean).join(' / ') })) }
}
