'use server'

import { revalidatePath } from 'next/cache'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import type { FormState } from '@/components/form'

export async function saveOpeningBalances(_: FormState, form: FormData): Promise<FormState & { saved?: boolean }> {
  const { supabase, org, fy } = await getContext()
  if (fy.is_closed) return { error: 'This financial year is closed' }
  const { data: ledgers } = await supabase.from('ledgers').select('id').eq('org_id', org.id)
  const ids = new Set((ledgers ?? []).map((l) => l.id))

  const upserts: { org_id: string; fy_id: string; ledger_id: string; amount: number }[] = []
  const zero: string[] = []
  for (const id of ids) {
    const dr = toPaise(String(form.get(`dr_${id}`) ?? ''))
    const cr = toPaise(String(form.get(`cr_${id}`) ?? ''))
    if (dr < 0 || cr < 0) return { error: 'Amounts cannot be negative' }
    if (dr && cr) return { error: 'Enter either a debit or a credit for each account, not both' }
    const amount = dr - cr
    if (amount) upserts.push({ org_id: org.id, fy_id: fy.id, ledger_id: id, amount })
    else if (form.has(`dr_${id}`)) zero.push(id)
  }
  if (upserts.length) {
    const { error } = await supabase.from('opening_balances').upsert(upserts, { onConflict: 'fy_id,ledger_id' })
    if (error) return { error: friendlyError(error.message) }
  }
  if (zero.length) {
    const { error } = await supabase.from('opening_balances').delete().eq('fy_id', fy.id).in('ledger_id', zero)
    if (error) return { error: friendlyError(error.message) }
  }
  revalidatePath('/accounts', 'layout')
  return { saved: true }
}
