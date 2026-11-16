'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import type { FormState } from '@/components/form'

const Receipt = z.object({
  party_ledger_id: z.string().uuid('Choose who paid'),
  cash_bank_ledger_id: z.string().uuid('Choose the cash or bank account'),
  voucher_date: z.iso.date('Choose the date'),
  amount: z.string().refine((v) => toPaise(v) > 0, 'Enter the amount received'),
  mode: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'card']),
  cheque_no: z.string().trim(),
  cheque_date: z.string(),
  cheque_bank: z.string().trim(),
  reference: z.string().trim(),
  narration: z.string().trim(),
  allocations: z.array(z.object({ invoice_id: z.string().uuid(), amount: z.string() })),
})

export async function saveReceipt(_: FormState, form: FormData): Promise<FormState> {
  let json: unknown
  try {
    json = JSON.parse(String(form.get('payload')))
  } catch {
    return { error: 'Could not read the form. Please reload and try again.' }
  }
  const parsed = Receipt.safeParse(json)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const r = parsed.data
  if (r.mode === 'cheque' && !r.cheque_no) return { error: 'Enter the cheque number' }

  const amount = toPaise(r.amount)
  const allocations = r.allocations
    .map((a) => ({ invoice_id: a.invoice_id, amount: toPaise(a.amount) }))
    .filter((a) => a.amount > 0)
  if (allocations.some((a) => a.amount < 0)) return { error: 'Allocations cannot be negative' }
  if (allocations.reduce((s, a) => s + a.amount, 0) > amount) return { error: 'You have allocated more than the amount received' }

  const { supabase, org } = await getContext()
  const { data: id, error } = await supabase.rpc('save_receipt', {
    p_org: org.id,
    p: {
      ...r,
      amount,
      allocations,
      cheque_date: r.cheque_date || null,
    },
  })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/vouchers/receipts')
  revalidatePath('/billing/invoices')
  revalidatePath('/dashboard')
  redirect(`/vouchers/receipts?saved=${id}`)
}
