import 'server-only'
import type { GroupOpt } from '@/lib/invoice'
import { getContext } from '@/lib/context'
import { getParties } from '../../crm/leads/data'
import { getStates } from '../../masters/ledgers/data'

export async function getInvoiceFormOptions() {
  const { supabase, org } = await getContext()
  const [customers, suppliers, states, { data: airlines }, { data: o }, { data: bookedBy }, { data: pax }] = await Promise.all([
    getParties('customer'),
    getParties('supplier'),
    getStates(),
    supabase.from('airlines').select('id, code, name').order('name'),
    supabase.from('orgs').select('state_id').eq('id', org.id).single(),
    supabase.from('lookups').select('id, name').eq('org_id', org.id).eq('kind', 'booked_by').eq('is_active', true).order('sort').order('name'),
    supabase.from('passengers').select('title, first_name, last_name').eq('org_id', org.id).order('first_name').limit(1000),
  ])
  const { data: groups } = await supabase.from('v_group_purchase').select('id, bill_no, sector, pnr, flight_no, airline_id, travel_date, seats, left_seats, taxable').eq('org_id', org.id).order('travel_date')
  return {
    customers,
    suppliers,
    states,
    airlines: (airlines ?? []) as { id: string; code: string; name: string }[],
    bookedBy: (bookedBy ?? []) as { id: string; name: string }[],
    passengers: (pax ?? []).map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ').toUpperCase()),
    orgStateId: (o?.state_id as string | null) ?? null,
    groups: (groups ?? []).map((g) => ({ ...g, cost_per_seat: g.seats ? Math.round(Number(g.taxable) / g.seats) : 0 })) as GroupOpt[],
  }
}
