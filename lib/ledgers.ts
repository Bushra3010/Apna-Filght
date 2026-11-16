// Shared by server pages and client forms.
export const LEDGER_KINDS = [
  ['customer', 'Customer / client'],
  ['supplier', 'Supplier / airline / consolidator'],
  ['bank', 'Bank account'],
  ['cash', 'Cash'],
  ['expense', 'Expense'],
  ['income', 'Other income'],
  ['capital', 'Capital'],
  ['other', 'Other'],
] as const

/** Account group (system_key) each kind of ledger belongs to. */
export const LEDGER_GROUP: Record<string, string> = {
  customer: 'sundry_debtors',
  supplier: 'sundry_creditors',
  bank: 'bank_accounts',
  cash: 'cash',
  income: 'indirect_income',
  expense: 'indirect_expense',
  capital: 'capital',
  other: 'current_assets',
}
