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
  airline: string
  flight_no: string
  from_code: string
  to_code: string
  travel_date: string // YYYY-MM-DD
  depart_time: string | null // HH:MM, local
  arrive_time: string | null
}

/** "2026-11-26 06:00+05:30" -> "06:00" */
const hhmm = (local: unknown) => (typeof local === 'string' ? (local.match(/[ T](\d{2}:\d{2})/)?.[1] ?? null) : null)

type AdbTime = { local?: string }
type AdbEnd = { airport?: { iata?: string }; scheduledTime?: AdbTime }
type AdbFlight = { number?: string; airline?: { name?: string }; departure?: AdbEnd; arrival?: AdbEnd; movement?: AdbEnd }

/**
 * Direct flights from one airport to another on a date, earliest first.
 * Needs RAPIDAPI_KEY (a RapidAPI key subscribed to AeroDataBox). Throws a message fit to show the user.
 */
export async function searchFlights(from: string, to: string, date: string): Promise<Flight[]> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw new Error('Flight search is not connected yet. Add the flights by hand below.')
  const host = 'aerodatabox.p.rapidapi.com'
  // The airport board covers at most 12 hours per call, so a day is two calls.
  const windows = [['00:00', '11:59'], ['12:00', '23:59']]
  const found: Flight[] = []
  for (const [a, b] of windows) {
    const url = `https://${host}/flights/airports/iata/${from}/${date}T${a}/${date}T${b}?direction=Departure&withLeg=true&withCancelled=false&withCodeshared=false&withCargo=false&withPrivate=false`
    const res = await fetch(url, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host }, next: { revalidate: 6 * 3600 } })
    if (res.status === 204) continue
    if (res.status === 429) throw new Error('The free flight search limit is used up for now. Add the flights by hand below.')
    if (!res.ok) throw new Error(`Flight search did not work (${res.status}). Add the flights by hand below.`)
    const body = (await res.json()) as { departures?: AdbFlight[] }
    for (const f of body.departures ?? []) {
      const dest = f.arrival?.airport?.iata ?? f.movement?.airport?.iata
      if (dest !== to || !f.number) continue
      found.push({
        airline: f.airline?.name ?? f.number.split(' ')[0],
        flight_no: f.number,
        from_code: from,
        to_code: to,
        travel_date: date,
        depart_time: hhmm(f.departure?.scheduledTime?.local ?? (f.arrival ? undefined : f.movement?.scheduledTime?.local)),
        arrive_time: hhmm(f.arrival?.scheduledTime?.local),
      })
    }
  }
  const seen = new Set<string>()
  return found
    .filter((f) => !seen.has(f.flight_no) && seen.add(f.flight_no))
    .sort((x, y) => (x.depart_time ?? '').localeCompare(y.depart_time ?? ''))
}

/** The WhatsApp text listing the saved options. */
export function flightOptionsMessage(guest: string, company: string, options: (Flight & { price: number | null })[]): string {
  const first = options[0]
  const dayOf = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'UTC' })
  const rupees = (p: number) => `₹${new Intl.NumberFormat('en-IN').format(Math.round(p / 100))}`
  // Options for another route or day say so on their own line.
  const same = (o: Flight) => o.from_code === first.from_code && o.to_code === first.to_code && o.travel_date === first.travel_date
  const lines = options.map((o, i) => {
    const time = [o.depart_time, o.arrive_time].filter(Boolean).join(' → ')
    const where = same(o) ? '' : ` (${o.from_code}-${o.to_code}, ${dayOf(o.travel_date)})`
    return `${i + 1}. ${o.airline} ${o.flight_no}${where}${time ? `, ${time}` : ''}${o.price ? ` : ${rupees(o.price)}` : ''}`
  })
  const day = dayOf(first.travel_date)
  return `Dear ${guest},\n\nFlight options for ${airportCity(first.from_code)} to ${airportCity(first.to_code)} on ${day}:\n\n${lines.join('\n')}\n\nRates are per person and can change until booked. Tell us which one to book.\n\nRegards,\n${company}`
}
