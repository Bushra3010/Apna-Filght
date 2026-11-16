// Builds the trial balance tree, profit & loss and balance sheet from
// trial_balance() rows. Amounts are paise; + is debit, − is credit.

export type TbRow = {
  ledger_id: string
  ledger_name: string
  ledger_kind: string
  group_id: string
  group_name: string
  top_group_id: string
  top_group_name: string
  top_group_key: string | null
  nature: 'asset' | 'liability' | 'income' | 'expense' | 'equity'
  top_sort: number
  opening: number
  debit: number
  credit: number
  closing: number
}

export const normalise = (rows: Record<string, unknown>[]): TbRow[] =>
  rows.map((r) => ({
    ...(r as unknown as TbRow),
    opening: Number(r.opening),
    debit: Number(r.debit),
    credit: Number(r.credit),
    closing: Number(r.closing),
    top_sort: Number(r.top_sort),
  }))

export type Section = { key: string; name: string; total: number; ledgers: { id: string; name: string; amount: number }[] }

/** Group rows by top-level group; `pick` chooses the amount (closing, or period movement). */
export function sections(rows: TbRow[], pick: (r: TbRow) => number, filter: (r: TbRow) => boolean): Section[] {
  const map = new Map<string, Section & { sort: number }>()
  for (const r of rows.filter(filter)) {
    const amt = pick(r)
    if (amt === 0) continue
    const s = map.get(r.top_group_id) ?? { key: r.top_group_key ?? r.top_group_id, name: r.top_group_name, total: 0, ledgers: [], sort: r.top_sort }
    s.total += amt
    s.ledgers.push({ id: r.ledger_id, name: r.ledger_name, amount: amt })
    map.set(r.top_group_id, s)
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort)
}

const movement = (r: TbRow) => r.debit - r.credit

/** Profit & loss for the period. Income shown positive, expenses positive. */
export function profitAndLoss(rows: TbRow[]) {
  const income = (k: string[]) => sections(rows, (r) => -movement(r), (r) => r.nature === 'income' && k.includes(r.top_group_key ?? ''))
  const expense = (k: string[]) => sections(rows, (r) => movement(r), (r) => r.nature === 'expense' && k.includes(r.top_group_key ?? ''))
  const directIncome = income(['sales', 'direct_income'])
  const directExpense = expense(['purchase', 'direct_expense'])
  const indirectIncome = sections(rows, (r) => -movement(r), (r) => r.nature === 'income' && !['sales', 'direct_income'].includes(r.top_group_key ?? ''))
  const indirectExpense = sections(rows, (r) => movement(r), (r) => r.nature === 'expense' && !['purchase', 'direct_expense'].includes(r.top_group_key ?? ''))
  const sum = (s: Section[]) => s.reduce((a, x) => a + x.total, 0)
  const gross = sum(directIncome) - sum(directExpense)
  const net = gross + sum(indirectIncome) - sum(indirectExpense)
  return { directIncome, directExpense, indirectIncome, indirectExpense, gross, net }
}

/** Balance sheet as on the end of the rows' range. Liabilities/capital shown positive. */
export function balanceSheet(rows: TbRow[]) {
  const pl = profitAndLoss(rows)
  const liabilities = sections(rows, (r) => -r.closing, (r) => r.nature === 'liability' || r.nature === 'equity')
  const assets = sections(rows, (r) => r.closing, (r) => r.nature === 'asset')
  const sum = (s: Section[]) => s.reduce((a, x) => a + x.total, 0)
  // any opening imbalance shows up as a difference rather than hiding
  const openingDiff = rows.reduce((a, r) => a + r.opening, 0)
  const totalLiab = sum(liabilities) + pl.net
  const totalAssets = sum(assets)
  return { liabilities, assets, profit: pl.net, openingDiff, totalLiab, totalAssets, diff: totalAssets - totalLiab }
}
