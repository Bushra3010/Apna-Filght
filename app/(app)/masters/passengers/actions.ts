'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import type { FormState } from '@/components/form'

const opt = z.string().trim().transform((v) => (v === '' ? null : v))
const Schema = z.object({
  id: opt,
  title: opt.pipe(z.enum(['MR', 'MRS', 'MS', 'MSTR', 'MISS', 'DR']).nullable()),
  first_name: z.string().trim().min(1, 'Enter the first name'),
  last_name: opt,
  dob: opt,
  gender: opt.pipe(z.enum(['M', 'F', 'X']).nullable()),
  mobile: opt,
  email: opt,
  party_ledger_id: opt,
  passport_no: opt,
  passport_expiry: opt,
  address: opt,
  remark: opt,
})

export async function savePassenger(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { id, ...d } = parsed.data
  const { supabase, org } = await getContext()
  if (d.party_ledger_id) {
    const { count } = await supabase.from('ledgers').select('id', { count: 'exact', head: true }).eq('id', d.party_ledger_id).eq('org_id', org.id)
    if (!count) return { error: 'Choose a client from this company' }
  }
  const row = { ...d, org_id: org.id, first_name: d.first_name.toUpperCase(), last_name: d.last_name?.toUpperCase() ?? null, passport_no: d.passport_no?.toUpperCase() ?? null }
  const { error } = id ? await supabase.from('passengers').update(row).eq('id', id).eq('org_id', org.id) : await supabase.from('passengers').insert(row)
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/masters/passengers')
  redirect('/masters/passengers')
}
