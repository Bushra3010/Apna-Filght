export const LEAD_STATUSES = [
  ['initial', 'Initial'],
  ['active', 'Active'],
  ['proposal', 'Proposal'],
  ['negotiation', 'Negotiation'],
  ['pipeline', 'Pipeline'],
  ['booked', 'Booked'],
  ['not_interested', 'Not interested'],
  ['fake', 'Fake'],
] as const

export const LEAD_SERVICES = [
  ['flight', 'Flight'],
  ['hotel', 'Hotel'],
  ['visa', 'Visa'],
  ['tour_package', 'Tour package'],
  ['transport', 'Transport'],
  ['train_bus', 'Train / bus'],
  ['activities', 'Activities'],
  ['other', 'Other'],
] as const

export const LEAD_SOURCES = [
  ['walk_in', 'Walk-in'],
  ['call', 'Call'],
  ['email', 'Email'],
  ['whatsapp', 'WhatsApp'],
  ['website', 'Website'],
  ['ivr', 'IVR'],
  ['reference', 'Reference'],
  ['ads', 'Ads'],
  ['excel', 'Excel'],
] as const

export const FOLLOWUP_ACTIONS = [
  ['call', 'Call'],
  ['meeting_fixed', 'Meeting fixed'],
  ['spoke', 'Spoke'],
  ['proposal_sent', 'Proposal sent'],
  ['cancel', 'Cancel'],
  ['other', 'Other'],
] as const

// 2-hour slots, IST. Value = slot start (HH:MM).
export const TIME_SLOTS = [
  ['09:00', '9–11 AM'],
  ['11:00', '11 AM–1 PM'],
  ['13:00', '1–3 PM'],
  ['15:00', '3–5 PM'],
  ['17:00', '5–7 PM'],
] as const

export const label = (list: readonly (readonly [string, string])[], v: string | null | undefined) =>
  list.find(([k]) => k === v)?.[1] ?? v ?? ''

export function istDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
}

export function statusTone(status: string) {
  if (status === 'booked') return 'default' as const
  if (status === 'not_interested' || status === 'fake') return 'outline' as const
  return 'secondary' as const
}
