/** Today's date in India (YYYY-MM-DD). Never use toISOString() for "today": that is UTC, a day behind before 05:30 IST. */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** A timestamp as "17 Nov 2026, 3:05 pm" in India time. */
export function formatDateTimeIST(v: string | Date): string {
  return new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
}
