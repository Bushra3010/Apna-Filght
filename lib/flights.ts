// Flight schedules for the "Flight options" box on a lead.
// Schedules come from AeroDataBox (via RapidAPI, free plan); fares are not fetched: the agent types their own rate.

/** Airports the pickers offer: [IATA code, city]. */
export const AIRPORTS = [
  ['DEL', 'Delhi'], ['BOM', 'Mumbai'], ['BLR', 'Bengaluru'], ['MAA', 'Chennai'], ['HYD', 'Hyderabad'], ['CCU', 'Kolkata'],
  ['AMD', 'Ahmedabad'], ['PNQ', 'Pune'], ['GOI', 'Goa (Dabolim)'], ['GOX', 'Goa (Mopa)'], ['COK', 'Kochi'], ['JAI', 'Jaipur'],
  ['LKO', 'Lucknow'], ['PAT', 'Patna'], ['VNS', 'Varanasi'], ['IXC', 'Chandigarh'], ['ATQ', 'Amritsar'], ['SXR', 'Srinagar'],
  ['IXJ', 'Jammu'], ['IXL', 'Leh'], ['DED', 'Dehradun'], ['NAG', 'Nagpur'], ['IDR', 'Indore'], ['BHO', 'Bhopal'],
  ['RPR', 'Raipur'], ['IXR', 'Ranchi'], ['BBI', 'Bhubaneswar'], ['GAU', 'Guwahati'], ['IXB', 'Bagdogra'], ['IXZ', 'Port Blair'],
  ['TRV', 'Thiruvananthapuram'], ['CCJ', 'Kozhikode'], ['CJB', 'Coimbatore'], ['IXM', 'Madurai'], ['TRZ', 'Tiruchirappalli'],
  ['VTZ', 'Visakhapatnam'], ['IXE', 'Mangaluru'], ['STV', 'Surat'], ['BDQ', 'Vadodara'], ['UDR', 'Udaipur'], ['JDH', 'Jodhpur'],
  ['AYJ', 'Ayodhya'], ['GOP', 'Gorakhpur'], ['IXA', 'Agartala'], ['IMF', 'Imphal'],
  ['DXB', 'Dubai'], ['AUH', 'Abu Dhabi'], ['SHJ', 'Sharjah'], ['DOH', 'Doha'], ['MCT', 'Muscat'], ['JED', 'Jeddah'],
  ['RUH', 'Riyadh'], ['MED', 'Madinah'], ['KWI', 'Kuwait'], ['BAH', 'Bahrain'], ['SIN', 'Singapore'], ['KUL', 'Kuala Lumpur'],
  ['BKK', 'Bangkok'], ['HKT', 'Phuket'], ['DPS', 'Bali'], ['HAN', 'Hanoi'], ['CMB', 'Colombo'], ['KTM', 'Kathmandu'],
  ['MLE', 'Male'], ['LHR', 'London'], ['JFK', 'New York'], ['CDG', 'Paris'], ['IST', 'Istanbul'], ['GYD', 'Baku'],
  ['TBS', 'Tbilisi'], ['MRU', 'Mauritius'],
] as const

export const airportCity = (code: string) => AIRPORTS.find(([c]) => c === code)?.[1] ?? code

/** "Mumbai", "mumbai (BOM)" or "bom" -> "BOM"; null when it isn't an airport we know or a 3-letter code. */
export function airportCode(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  if (!t) return null
  const inBrackets = t.match(/\(([A-Za-z]{3})\)/)?.[1]
  if (inBrackets) return inBrackets.toUpperCase()
  const byCity = AIRPORTS.find(([c, city]) => city.toLowerCase() === t.toLowerCase() || city.toLowerCase().startsWith(t.toLowerCase() + ' ') || c === t.toUpperCase())
  if (byCity) return byCity[0]
  if (t.toLowerCase() === 'new delhi') return 'DEL'
  if (t.toLowerCase() === 'bangalore') return 'BLR'
  return /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : null
}

export type Flight = {
  airline: string // 'IndiGo', or 'IndiGo + Emirates' for a connection
  flight_no: string // '6E 2135', or '6E 1461 + EK 501'
  from_code: string
  to_code: string
  travel_date: string // YYYY-MM-DD, the day it leaves
  depart_time: string | null // HH:MM, local
  arrive_time: string | null // HH:MM, local at the destination
  via_code?: string | null // where you change planes; null / missing = direct
  layover_min?: number | null // minutes on the ground at via_code
  arrive_day_offset?: number | null // 1 when it lands the next day
}

/** 135 -> "2h 15m" */
export const duration = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`

/** "06:00 → 18:30 (+1)" */
export const flightTimes = (f: Flight) => {
  const t = [f.depart_time, f.arrive_time].filter(Boolean).join(' → ')
  return t ? `${t}${f.arrive_day_offset ? ` (+${f.arrive_day_offset})` : ''}` : ''
}

/** "1 stop in Dubai, 2h 15m wait"; '' for a direct flight. */
export const stopNote = (f: Flight) =>
  f.via_code ? `1 stop in ${airportCity(f.via_code)}${f.layover_min ? `, ${duration(f.layover_min)} wait` : ''}` : ''

/** "2026-11-26 06:00+05:30" -> "06:00" */
const hhmm = (local: unknown) => (typeof local === 'string' ? (local.match(/[ T](\d{2}:\d{2})/)?.[1] ?? null) : null)
/** "2026-11-27 00:30Z" -> epoch ms */
const ms = (utc: unknown) => (typeof utc === 'string' ? Date.parse(utc.replace(' ', 'T')) : NaN)
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)

type AdbTime = { local?: string; utc?: string }
type AdbEnd = { airport?: { iata?: string }; scheduledTime?: AdbTime }
type AdbFlight = { number?: string; airline?: { name?: string }; departure?: AdbEnd; arrival?: AdbEnd; movement?: AdbEnd }

/** One flight between two airports, as read off an airport board. */
type Leg = { airline: string; number: string; from: string; to: string; depLocal?: string; arrLocal?: string; depAt: number; arrAt: number }

const HOST = 'aerodatabox.p.rapidapi.com'
const HALVES = [['00:00', '11:59'], ['12:00', '23:59']] as const

/**
 * Half a day of an airport's departure or arrival board (the API gives at most 12 hours per call).
 * Needs RAPIDAPI_KEY (a RapidAPI key subscribed to AeroDataBox). Throws a message fit to show the user.
 */
async function board(airport: string, date: string, half: readonly [string, string], direction: 'Departure' | 'Arrival'): Promise<Leg[]> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new Error('Flight search is not connected yet. Add the flights by hand below.')
  const url = `https://${HOST}/flights/airports/iata/${airport}/${date}T${half[0]}/${date}T${half[1]}?direction=${direction}&withLeg=true&withCancelled=false&withCodeshared=false&withCargo=false&withPrivate=false`
  const res = await fetch(url, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST }, next: { revalidate: 6 * 3600 } })
  if (res.status === 204) return []
  if (res.status === 429) throw new Error('The free flight search limit is used up for now. Add the flights by hand below.')
  if (!res.ok) throw new Error(`Flight search did not work (${res.status}). Add the flights by hand below.`)
  const body = (await res.json()) as { departures?: AdbFlight[]; arrivals?: AdbFlight[] }
  const legs: Leg[] = []
  for (const f of (direction === 'Departure' ? body.departures : body.arrivals) ?? []) {
    // the board's own airport has no `airport` on its side of the leg
    const from = direction === 'Departure' ? airport : f.departure?.airport?.iata
    const to = direction === 'Arrival' ? airport : (f.arrival?.airport?.iata ?? f.movement?.airport?.iata)
    if (!f.number || !from || !to) continue
    const dep = f.departure?.scheduledTime ?? (direction === 'Departure' && !f.arrival ? f.movement?.scheduledTime : undefined)
    legs.push({
      airline: f.airline?.name ?? f.number.split(' ')[0],
      number: f.number,
      from,
      to,
      depLocal: dep?.local,
      arrLocal: f.arrival?.scheduledTime?.local,
      depAt: ms(dep?.utc),
      arrAt: ms(f.arrival?.scheduledTime?.utc),
    })
  }
  return legs
}

const departures = async (airport: string, date: string) => (await Promise.all(HALVES.map((h) => board(airport, date, h, 'Departure')))).flat()
const unique = <T,>(list: T[], key: (x: T) => string) => { const seen = new Set<string>(); return list.filter((x) => !seen.has(key(x)) && seen.add(key(x))) }
const dayOffset = (date: string, arrLocal?: string) => (arrLocal && arrLocal.slice(0, 10) > date ? Math.round((Date.parse(arrLocal.slice(0, 10)) - Date.parse(date)) / 86400000) : 0)

/** Direct flights from one airport to another on a date, earliest first. */
export async function searchFlights(from: string, to: string, date: string): Promise<Flight[]> {
  const legs = (await departures(from, date)).filter((l) => l.to === to)
  return unique(legs, (l) => l.number)
    .map((l) => ({
      airline: l.airline,
      flight_no: l.number,
      from_code: from,
      to_code: to,
      travel_date: date,
      depart_time: hhmm(l.depLocal),
      arrive_time: hhmm(l.arrLocal),
      via_code: null,
      layover_min: null,
      arrive_day_offset: dayOffset(date, l.arrLocal),
    }))
    .sort((x, y) => (x.depart_time ?? '').localeCompare(y.depart_time ?? ''))
}

const MIN_WAIT = 90 // minutes: less than this is too tight to change planes
const MAX_WAIT = 8 * 60

/**
 * Journeys with one change of plane, shortest first. Built by pairing every flight leaving `from` that day
 * with a flight reaching `to` (same day or the next morning) from the same airport, with 1.5 to 8 hours between them.
 * These are timetable matches, not fares an airline sells as one ticket: the agent checks them on the booking portal.
 */
export async function searchConnections(from: string, to: string, date: string, limit = 15): Promise<Flight[]> {
  const [out, ...into] = await Promise.all([
    departures(from, date),
    board(to, date, HALVES[0], 'Arrival'),
    board(to, date, HALVES[1], 'Arrival'),
    board(to, nextDay(date), HALVES[0], 'Arrival'),
  ])
  const byHub = new Map<string, Leg[]>()
  for (const l of into.flat()) {
    if (l.from === from || Number.isNaN(l.depAt)) continue
    byHub.set(l.from, [...(byHub.get(l.from) ?? []), l])
  }
  const journeys: { flight: Flight; total: number; same: boolean }[] = []
  for (const a of out) {
    if (a.to === to || Number.isNaN(a.arrAt) || Number.isNaN(a.depAt)) continue
    // the first onward flight that leaves enough time; later ones only add waiting
    const b = (byHub.get(a.to) ?? [])
      .filter((x) => x.depAt - a.arrAt >= MIN_WAIT * 60000 && x.depAt - a.arrAt <= MAX_WAIT * 60000)
      .sort((x, y) => Number(y.airline === a.airline) - Number(x.airline === a.airline) || x.arrAt - y.arrAt)[0]
    if (!b || Number.isNaN(b.arrAt)) continue
    journeys.push({
      flight: {
        airline: a.airline === b.airline ? a.airline : `${a.airline} + ${b.airline}`,
        flight_no: `${a.number} + ${b.number}`,
        from_code: from,
        to_code: to,
        travel_date: date,
        depart_time: hhmm(a.depLocal),
        arrive_time: hhmm(b.arrLocal),
        via_code: a.to,
        layover_min: Math.round((b.depAt - a.arrAt) / 60000),
        arrive_day_offset: dayOffset(date, b.arrLocal),
      },
      total: b.arrAt - a.depAt,
      same: a.airline === b.airline,
    })
  }
  // one airline all the way first (those are the ones usually sold on one ticket), then the shortest journey
  return unique(journeys.sort((x, y) => Number(y.same) - Number(x.same) || x.total - y.total), (j) => j.flight.flight_no)
    .slice(0, limit)
    .map((j) => j.flight)
}

/** The WhatsApp text listing the saved options. */
export function flightOptionsMessage(guest: string, company: string, options: (Flight & { price: number | null })[]): string {
  const first = options[0]
  const dayOf = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'UTC' })
  const rupees = (p: number) => `₹${new Intl.NumberFormat('en-IN').format(Math.round(p / 100))}`
  // Options for another route or day say so on their own line.
  const same = (o: Flight) => o.from_code === first.from_code && o.to_code === first.to_code && o.travel_date === first.travel_date
  const lines = options.map((o, i) => {
    const time = flightTimes(o)
    const where = same(o) ? '' : ` (${o.from_code}-${o.to_code}, ${dayOf(o.travel_date)})`
    const stop = stopNote(o)
    return `${i + 1}. ${o.airline} ${o.flight_no}${where}${time ? `, ${time}` : ''}${stop ? `, ${stop}` : ''}${o.price ? ` : ${rupees(o.price)}` : ''}`
  })
  const day = dayOf(first.travel_date)
  return `Dear ${guest},\n\nFlight options for ${airportCity(first.from_code)} to ${airportCity(first.to_code)} on ${day}:\n\n${lines.join('\n')}\n\nRates are per person and can change until booked. Tell us which one to book.\n\nRegards,\n${company}`
}
