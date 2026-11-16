'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { LEDGER_GROUP } from '@/lib/ledgers'
import type { FormState } from '@/components/form'

const opt = z.string().trim().transform((v) => (v === '' ? null : v))

const Schema = z.object({
  id: opt,
  name: z.string().trim().min(2, 'Enter a name'),
  kind: z.enum(['customer', 'supplier', 'bank', 'cash', 'income', 'expense', 'capital', 'other']),
  gstin: opt.pipe(z.string().regex(/^\d{2}[A-Z0-9]{13}$/, 'GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5').nullable()),
  pan: opt,
  state_id: opt,
  address: opt,
  contact_person: opt,
  phone: opt,
  mobile: opt,
  email: opt,
  credit_days: z.coerce.number().int().min(0).max(365),
})

export async function saveLedger(_: FormState, form: FormData): Promise<FormState> {
  const raw = Object.fromEntries(form)
  const parsed = Schema.safeParse({ ...raw, gstin: String(raw.gstin ?? '').toUpperCase(), pan: String(raw.pan ?? '').toUpperCase() })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { id, ...data } = parsed.data
  const { supabase, org } = await getContext()

  const { data: group } = await supabase
    .from('account_groups')
    .select('id')
    .eq('org_id', org.id)
    .eq('system_key', LEDGER_GROUP[data.kind])
    .single()
  if (!group) return { error: 'Account group missing for this company' }

  const row = { ...data, org_id: org.id, group_id: group.id }
  const { error } = id
    ? await supabase.from('ledgers').update(row).eq('id', id).eq('org_id', org.id).is('system_key', null)
    : await supabase.from('ledgers').insert(row)
  if (error) return { error: friendlyError(error.message) }

  revalidatePath('/masters/ledgers')
  const back = String(raw.return_to ?? '')
  redirect(back.startsWith('/') ? back : '/masters/ledgers')
}
