'use server'

import { revalidatePath } from 'next/cache'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { MESSAGE_DOCS } from '@/lib/messages'
import type { FormState } from '@/components/form'

export async function saveTemplates(_: FormState, form: FormData): Promise<FormState & { saved?: boolean }> {
  const rows = MESSAGE_DOCS.map((d) => ({ doc_type: d.key, body: String(form.get(d.key) ?? '').replace(/\r\n?/g, '\n').trim() }))
  const empty = rows.find((r) => !r.body)
  if (empty) return { error: `The ${MESSAGE_DOCS.find((d) => d.key === empty.doc_type)!.label.toLowerCase()} message is empty` }
  if (rows.some((r) => r.body.length > 2000)) return { error: 'Keep each message under 2,000 characters' }
  const { supabase, org } = await getContext()
  const { error } = await supabase.from('message_templates')
    .upsert(rows.map((r) => ({ ...r, org_id: org.id, channel: 'whatsapp' })), { onConflict: 'org_id,doc_type,channel' })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/', 'layout')
  return { saved: true }
}

export async function resetTemplates(): Promise<void> {
  const { supabase, org } = await getContext()
  await supabase.from('message_templates').delete().eq('org_id', org.id).eq('channel', 'whatsapp')
  revalidatePath('/', 'layout')
}
