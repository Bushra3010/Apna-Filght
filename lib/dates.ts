/** Today's date in India (YYYY-MM-DD). Never use toISOString() for "today": that is UTC, a day behind before 05:30 IST. */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
