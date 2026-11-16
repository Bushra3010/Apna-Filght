'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import type { FormState } from '@/components/form'

const amount = z.string().refine((v) => v.trim() === '' || (Number.isFinite(Number(v.replace(/,/g, ''))) && Number(v.replace(/,/g, '')) >= 0), 'Amounts must be zero or more')

const Common = {
  voucher_date: z.iso.date('Choose the date'),
  mode: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'card']).optional(),
  cheque_no: z.string().trim().optional(),
  cheque_date: z.string().optional(),
  cheque_bank: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  narration: z.string().trim().optional(),
}

const Voucher = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('payment'),
    party_ledger_id: z.string().uuid('Choose who is paid'),
    cash_bank_ledger_id: z.string().uuid('Choose the cash or bank account'),
    amount: amount.refine((v) => toPaise(v) > 0, 'Enter the amount paid'),
    allocations: z.array(z.object({ invoice_id: z.string().optional(), purchase_bill_id: z.string().optional(), amount })),
    ...Common,
  }),
  z.object({
    kind: z.literal('contra'),
    party_ledger_id: z.string().uuid('Choose the account money goes to'),
    cash_bank_ledger_id: z.string().uuid('Choose the account money comes from'),
    amount: amount.refine((v) => toPaise(v) > 0, 'Enter the amount'),
    ...Common,
  }),
  z.object({
    kind: z.literal('journal'),
    lines: z.array(z.object({ ledger_id: z.string(), debit: amount, credit: amount, narration: z.string().trim() })),
    ...Common,
  }),
])

const PATH = { payment: 'payments', contra: 'contra', journal: 'journal' } as const

export async function saveVoucher(_: FormState, form: FormData): Promise<FormState> {
  let json: unknown
  try {
    json = JSON.parse(String(form.get('payload')))
  } catch {
    return { error: 'Could not read the form. Please reload and try again.' }
  }
  const parsed = Voucher.safeParse(json)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  if (v.mode === 'cheque' && !v.cheque_no) return { error: 'Enter the cheque number' }

  let p: Record<string, unknown>
  if (v.kind === 'journal') {
    const lines = v.lines
      .filter((l) => l.ledger_id && (toPaise(l.debit) || toPaise(l.credit)))
      .map((l) => ({ ledger_id: l.ledger_id, debit: toPaise(l.debit), credit: toPaise(l.credit), narration: l.narration }))
    if (lines.some((l) => l.debit && l.credit)) return { error: 'A line can have a debit or a credit, not both' }
    if (lines.length < 2) return { error: 'Enter at least two lines' }
    const dr = lines.reduce((s, l) => s + l.debit, 0)
    const cr = lines.reduce((s, l) => s + l.credit, 0)
    if (dr !== cr) return { error: 'Total debit must equal total credit' }
    p = { ...v, lines }
  } else if (v.kind === 'payment') {
    const allocations = v.allocations
      .map((a) => ({ invoice_id: a.invoice_id || null, purchase_bill_id: a.purchase_bill_id || null, amount: toPaise(a.amount) }))
      .filter((a) => a.amount > 0)
    const amt = toPaise(v.amount)
    if (allocations.reduce((s, a) => s + a.amount, 0) > amt) return { error: 'You have adjusted more than the amount paid' }
    p = { ...v, amount: amt, allocations, cheque_date: v.cheque_date || null }
  } else {
    p = { ...v, amount: toPaise(v.amount) }
  }

  const { supabase, org } = await getContext()
  const { data: id, error } = await supabase.rpc('save_voucher', { p_org: org.id, p })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath(`/vouchers/${PATH[v.kind]}`)
  revalidatePath('/billing/invoices')
  revalidatePath('/dashboard')
  redirect(`/vouchers/${PATH[v.kind]}?saved=${id}`)
}
