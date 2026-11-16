// All amounts are stored as integer paise (₹1 = 100 paise).

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const plain = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1234.5" | 1234.5 -> 123450 paise. Empty / invalid -> 0. */
export function toPaise(rupees: string | number | null | undefined): number {
  if (rupees === null || rupees === undefined || rupees === '') return 0
  const n = typeof rupees === 'number' ? rupees : Number(String(rupees).replace(/,/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** 123450 -> "₹1,234.50" */
export function formatINR(paise: number | string | null | undefined): string {
  return inr.format(Number(paise ?? 0) / 100)
}

/** 123450 -> "1,234.50" (for tables) */
export function formatAmount(paise: number | string | null | undefined): string {
  return plain.format(Number(paise ?? 0) / 100)
}

/** 123450 -> "1234.50" (for input values) */
export function paiseToInput(paise: number | string | null | undefined): string {
  const n = Number(paise ?? 0)
  return n === 0 ? '' : (n / 100).toFixed(2)
}
