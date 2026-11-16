// Shared by server pages and the client purchase form.
export type PLine = { ledger_id: string; description: string; taxable: string; gst_rate: string }
export type PurchaseDraft = {
  id?: string
  supplier_ledger_id: string
  bill_date: string
  supplier_bill_no: string
  supplier_bill_date: string
  place_of_supply_state_id: string
  tds: string
  notes: string
  lines: PLine[]
}
export const blankPLine = (): PLine => ({ ledger_id: '', description: '', taxable: '', gst_rate: '18' })
