import 'server-only'
import { getContext } from '@/lib/context'
import { getLookups } from '../data'
import { getParties } from '../leads/data'

export type HotelRateOpt = { id: string; label: string; hotel: string; category: string; meal: string; class_id: string | null; rate_type: string; sell: number; cost: number; valid_from: string; valid_to: string }
export type ActivityOpt = { id: string; label: string; unit: string; sell: number; cost: number }
export type VehicleOpt = { id: string; name: string; rate_per_km: number; night_charge: number; min_km_per_day: number; capacity: number | null }
export type ItineraryOpt = { id: string; title: string; route_id: string | null; package_title_id: string | null; nights: number }

export async function getQuotationOptions() {
  const { supabase, org } = await getContext()
  const n = (v: unknown) => (v as { name: string } | null)?.name ?? ''
  const [customers, classes, titles, meals, { data: routes }, { data: its }, { data: rates }, { data: acts }, { data: vehicles }, { data: policies }] = await Promise.all([
    getParties('customer'),
    getLookups('package_class'),
    getLookups('package_title'),
    getLookups('meal_plan'),
    supabase.from('routes').select('id, name').eq('org_id', org.id).order('name'),
    supabase.from('itineraries').select('id, title, route_id, package_title_id, nights').eq('org_id', org.id).order('title'),
    supabase.from('hotel_rates').select('id, package_class_id, rate_type, sell_rate, cost_rate, valid_from, valid_to, hotels(name, cities(name)), cat:lookups!hotel_rates_room_category_id_fkey(name), meal:lookups!hotel_rates_meal_plan_id_fkey(name), cls:lookups!hotel_rates_package_class_id_fkey(name)').eq('org_id', org.id).order('valid_from', { ascending: false }).limit(2000),
    supabase.from('activity_rates').select('id, unit, sell_rate, cost_rate, location, act:lookups!activity_rates_activity_id_fkey(name), cities(name)').eq('org_id', org.id).limit(2000),
    supabase.from('vehicles').select('id, name, rate_per_km, night_charge, min_km_per_day, capacity').eq('org_id', org.id).order('name'),
    supabase.from('policies').select('id, name, body').eq('org_id', org.id).order('kind').order('name'),
  ])
  const hotelRates: HotelRateOpt[] = (rates ?? []).map((r) => {
    const h = r.hotels as unknown as { name: string; cities: { name: string } | null }
    const parts = [h.name, h.cities?.name, n(r.cls), n(r.cat), n(r.meal)].filter(Boolean)
    return { id: r.id, label: parts.join(' · '), hotel: h.name, category: n(r.cat), meal: n(r.meal), class_id: r.package_class_id, rate_type: r.rate_type, sell: Number(r.sell_rate), cost: Number(r.cost_rate), valid_from: r.valid_from, valid_to: r.valid_to }
  })
  const activities: ActivityOpt[] = (acts ?? []).map((a) => ({
    id: a.id, label: [n(a.act), n(a.cities), a.location].filter(Boolean).join(' · '), unit: a.unit, sell: Number(a.sell_rate), cost: Number(a.cost_rate),
  }))
  return {
    customers,
    classes,
    titles,
    meals,
    routes: (routes ?? []) as { id: string; name: string }[],
    itineraries: (its ?? []) as ItineraryOpt[],
    hotelRates,
    activities,
    vehicles: (vehicles ?? []).map((v) => ({ ...v, rate_per_km: Number(v.rate_per_km), night_charge: Number(v.night_charge) })) as VehicleOpt[],
    policies: (policies ?? []) as { id: string; name: string; body: string }[],
  }
}
