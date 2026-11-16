'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import type { FormState } from '@/components/form'

export async function allocate(_: FormState, form: FormData): Promise<FormState> {
  const voucherId = String(form.get('voucher_id'))
  const allocs: { invoice_id?: string; purchase_bill_id?: string; amount: number }[] = []
  for (const [k, v] of form.entries()) {
    const amount = toPaise(String(v))
    if (amount < 0) return { error: 'Amounts cannot be negative' }
    if (!amount) continue
    if (k.startsWith('inv_')) allocs.push({ invoice_id: k.slice(4), amount })
    if (k.startsWith('bill_')) allocs.push({ purchase_bill_id: k.slice(5), amount })
  }
  if (!allocs.length) return { error: 'Enter an amount against at least one bill' }
  const { supabase, org } = await getContext()
  const { error } = await supabase.rpc('allocate_voucher', { p_org: org.id, p_voucher: voucherId, p_allocs: allocs })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/vouchers/adjust')
  revalidatePath('/billing/invoices')
  redirect('/vouchers/adjust')
}
