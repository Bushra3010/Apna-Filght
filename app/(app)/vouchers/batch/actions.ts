'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'

export type BatchResult = { row: number; ok: boolean; message: string }
export type BatchState = { error?: string; results?: BatchResult[] } | undefined

const Batch = z.object({
  kind: z.enum(['receipt', 'payment']),
  voucher_date: z.iso.date('Choose the date'),
  cash_bank_ledger_id: z.string().uuid('Choose the cash or bank account'),
  mode: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'card']),
  rows: z.array(z.object({ party_ledger_id: z.string(), amount: z.string(), reference: z.string(), narration: z.string() })),
})

/** Saves each row as its own receipt / payment (kept on account; adjust against bills later). */
export async function saveBatch(_: BatchState, form: FormData): Promise<BatchState> {
  let json: unknown
  try {
    json = JSON.parse(String(form.get('payload')))
  } catch {
    return { error: 'Could not read the form. Please reload and try again.' }
  }
  const p = Batch.safeParse(json)
  if (!p.success) return { error: p.error.issues[0].message }
  const b = p.data
  const rows = b.rows.map((r, i) => ({ ...r, i })).filter((r) => r.party_ledger_id || r.amount.trim())
  if (!rows.length) return { error: 'Enter at least one row' }
  for (const r of rows) {
    if (!r.party_ledger_id) return { error: `Row ${r.i + 1}: choose the party` }
    if (toPaise(r.amount) <= 0) return { error: `Row ${r.i + 1}: enter the amount` }
  }

  const { supabase, org } = await getContext()
  const results: BatchResult[] = []
  for (const r of rows) {
    const common = {
      voucher_date: b.voucher_date, cash_bank_ledger_id: b.cash_bank_ledger_id, party_ledger_id: r.party_ledger_id,
      amount: toPaise(r.amount), mode: b.mode, reference: r.reference, narration: r.narration,
    }
    const { data: id, error } = b.kind === 'receipt'
      ? await supabase.rpc('save_receipt', { p_org: org.id, p: { ...common, allocations: [] } })
      : await supabase.rpc('save_voucher', { p_org: org.id, p: { ...common, kind: 'payment', allocations: [] } })
    if (error) {
      results.push({ row: r.i + 1, ok: false, message: friendlyError(error.message) })
      continue
    }
    const { data: v } = await supabase.from('vouchers').select('voucher_no').eq('id', id as string).single()
    results.push({ row: r.i + 1, ok: true, message: v?.voucher_no ?? 'saved' })
  }
  revalidatePath(b.kind === 'receipt' ? '/vouchers/receipts' : '/vouchers/payments')
  revalidatePath('/vouchers/adjust')
  return { results }
}
