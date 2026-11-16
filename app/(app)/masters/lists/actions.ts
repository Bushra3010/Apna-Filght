'use server'

import { revalidatePath } from 'next/cache'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { isLookupKind } from '@/lib/lookups'
import type { FormState } from '@/components/form'

export async function addLookup(_: FormState, form: FormData): Promise<FormState> {
  const kind = String(form.get('kind'))
  const name = String(form.get('name') ?? '').trim()
  if (!isLookupKind(kind)) return { error: 'Unknown list' }
  if (name.length < 1 || name.length > 80) return { error: 'Enter a name (up to 80 characters)' }
  const { supabase, org } = await getContext()
  const { error } = await supabase.from('lookups').insert({ org_id: org.id, kind, name })
  if (error) return { error: error.message.includes('duplicate') ? `“${name}” is already in this list` : friendlyError(error.message) }
  revalidatePath('/masters/lists')
  return { error: undefined }
}

export async function updateLookup(form: FormData) {
  const id = String(form.get('id'))
  const name = String(form.get('name') ?? '').trim()
  const active = form.get('is_active') === 'on'
  const { supabase, org } = await getContext()
  if (name) await supabase.from('lookups').update({ name, is_active: active }).eq('id', id).eq('org_id', org.id)
  revalidatePath('/masters/lists')
}
