// Turning spreadsheet cells into clean values. Pure functions (unit-tested).

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
const year4 = (y: number) => (y < 100 ? 2000 + y : y)

/** Accepts 2026-11-17, 17/11/2026, 17-11-26, 17-Nov-2026, 17 Nov 26, Excel serial numbers. Day first (Indian style). */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  const s = String(v).trim()
  if (!s) return null
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return valid(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/)
  if (m) { const y = year4(+m[3]); return valid(y, +m[2], +m[1]) ? `${y}-${pad(+m[2])}-${pad(+m[1])}` : null }
  m = s.match(/^(\d{1,2})[-/. ]?([A-Za-z]{3,4})[-/. ,]*(\d{2,4})$/)
  if (m && MONTHS[m[2].toLowerCase()]) { const y = year4(+m[3]); const mo = MONTHS[m[2].toLowerCase()]; return valid(y, mo, +m[1]) ? `${y}-${pad(mo)}-${pad(+m[1])}` : null }
  if (/^\d{5}(\.\d+)?$/.test(s)) { // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  return null
}

/** "₹ 1,23,456.50", "Rs.500", "(200)" → rupees as a string with 2 decimals; blank → "". Invalid → null. */
export function parseMoney(v: unknown): string | null {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(2) : null
  let s = String(v).trim()
  if (!s || s === '-') return ''
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-')
  s = s.replace(/[()₹,\s-]|rs\.?|inr/gi, '')
  if (!s) return ''
  if (!/^\d*\.?\d+$/.test(s)) return null
  const n = Number(s) * (neg ? -1 : 1)
  return n.toFixed(2)
}

/** Header text → comparable key: "Pax Name " → "paxname". */
export const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')
