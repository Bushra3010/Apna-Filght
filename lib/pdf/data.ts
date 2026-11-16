import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Company } from './kit'
import type { InvoiceData, Line } from './invoice'
import type { VoucherData } from './voucher'
import type { Q, QuotationData } from './quotation'

// Loads what the PDF documents need. The PDFs themselves are drawn in the browser (see components/pdf-view.tsx).

const COMPANY_COLS = 'name, legal_name, address_line1, address_line2, pincode, mobile, email, gstin, invoice_terms, states(name, gst_code)'

const INV_COLS = 'id, invoice_no, invoice_date, due_date, doc_kind, bill_type, is_interstate, taxable, cgst, sgst, igst, total, notes, contact_phone, party_ledger_id, ' +
  'party:ledgers!invoices_party_ledger_id_fkey(name, gstin, address, mobile), pos:states!invoices_place_of_supply_state_id_fkey(name, gst_code), ref:ref_invoice_id(invoice_no, invoice_date)'

export async function loadCompany(supabase: SupabaseClient, orgId: string) {
  const { data } = await supabase.from('orgs').select(COMPANY_COLS).eq('id', orgId).single()
  const c = data as unknown as (Company & { invoice_terms: string | null; states: Company['state'] }) | null
  return c ? { ...c, state: c.states } : null
}

/** Invoices (any kind) with their lines, in the order of `ids`. */
export async function loadInvoices(supabase: SupabaseClient, orgId: string, ids: string[]): Promise<InvoiceData[]> {
  if (!ids.length) return []
  const [{ data: invs }, { data: lines }, company] = await Promise.all([
    supabase.from('invoices').select(INV_COLS).eq('org_id', orgId).in('id', ids),
    supabase.from('invoice_lines').select('*, airlines(code)').eq('org_id', orgId).in('invoice_id', ids).order('sort'),
    loadCompany(supabase, orgId),
  ])
  if (!company) return []
  const byId = new Map((invs ?? []).map((i) => [(i as unknown as { id: string }).id, i]))
  return ids.filter((id) => byId.has(id)).map((id) => ({
    inv: byId.get(id) as unknown as InvoiceData['inv'],
    lines: (lines ?? []).filter((l) => l.invoice_id === id) as Line[],
    company,
  }))
}

export async function loadVoucher(supabase: SupabaseClient, orgId: string, id: string): Promise<VoucherData | null> {
  const [{ data: v }, { data: alloc }, company] = await Promise.all([
    supabase.from('vouchers')
      .select('id, kind, voucher_no, voucher_date, amount, mode, reference, narration, cheque_no, cheque_date, cheque_bank, status, party:ledgers!vouchers_party_ledger_id_fkey(name, address, gstin), account:ledgers!vouchers_cash_bank_ledger_id_fkey(name)')
      .eq('org_id', orgId).eq('id', id).in('kind', ['receipt', 'payment']).maybeSingle(),
    supabase.from('bill_allocations').select('amount, invoices(invoice_no, invoice_date), purchase_bills(bill_no, bill_date)').eq('org_id', orgId).eq('voucher_id', id),
    loadCompany(supabase, orgId),
  ])
  if (!v || !company) return null
  const against = (alloc ?? []).map((a) => {
    const inv = a.invoices as unknown as { invoice_no: string; invoice_date: string } | null
    const pb = a.purchase_bills as unknown as { bill_no: string; bill_date: string } | null
    return { no: inv?.invoice_no ?? pb?.bill_no ?? '', date: inv?.invoice_date ?? pb?.bill_date ?? '', amount: Number(a.amount) }
  })
  return { v: v as unknown as VoucherData['v'], against, company }
}

export async function loadQuotation(supabase: SupabaseClient, orgId: string, id: string): Promise<QuotationData | null> {
  const [{ data: q }, { data: items }, company] = await Promise.all([
    supabase.from('quotations').select('*, routes(name), ptitle:lookups!quotations_package_title_id_fkey(name), meal:lookups!quotations_meal_plan_id_fkey(name)').eq('org_id', orgId).eq('id', id).maybeSingle(),
    supabase.from('quotation_items').select('kind, description').eq('quotation_id', id).order('day_no', { nullsFirst: false }).order('sort'),
    loadCompany(supabase, orgId),
  ])
  if (!q || !company) return null
  const { data: days } = q.itinerary_id
    ? await supabase.from('itinerary_days').select('day_no, title, description, cities(name)').eq('itinerary_id', q.itinerary_id).order('day_no')
    : { data: [] }
  return { q: q as Q, items: items ?? [], days: (days ?? []) as unknown as QuotationData['days'], company }
}

