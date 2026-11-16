/** "2026-11" → first and last day, GST period code MMYYYY and a label. Defaults to last month. */
export function gstPeriod(month?: string) {
  let ym = month && /^\d{4}-\d{2}$/.test(month) ? month : ''
  if (!ym) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    month: ym,
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, '0')}`,
    fp: `${String(m).padStart(2, '0')}${y}`,
    label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }
}
