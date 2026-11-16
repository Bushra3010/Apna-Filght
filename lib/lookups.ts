export const LOOKUP_KINDS = [
  ['booked_by', 'Booked by', 'Staff or agents shown on invoices'],
  ['service_type', 'Service types', ''],
  ['visa_type', 'Visa types', ''],
  ['room_type', 'Room types', ''],
  ['room_category', 'Room categories', ''],
  ['meal_plan', 'Meal plans', ''],
  ['taxi_type', 'Taxi types', ''],
  ['package_type', 'Package types', ''],
  ['package_class', 'Package classes', ''],
  ['followup_action', 'Follow-up actions', ''],
  ['destination', 'Destinations', ''],
  ['bank_name', 'Bank names', ''],
] as const

export type LookupKind = (typeof LOOKUP_KINDS)[number][0]
export const isLookupKind = (k: string): k is LookupKind => LOOKUP_KINDS.some(([v]) => v === k)
