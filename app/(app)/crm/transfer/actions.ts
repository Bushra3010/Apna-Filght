'use server'

import { revalidatePath } from 'next/cache'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import type { FormState } from '@/components/form'

export async function transferLeads(_: (FormState & { moved?: number }) | undefined, form: FormData): Promise<FormState & { moved?: number }> {
  const from = String(form.get('from') ?? '')
  const to = String(form.get('to') ?? '')
  const statuses = form.getAll('status').map(String)
  if (!from || !to) return { error: 'Choose who the leads move from and to' }
  if (!statuses.length) return { error: 'Tick at least one status' }
  const { supabase, org } = await getContext()
  const { data, error } = await supabase.rpc('transfer_leads', { p_org: org.id, p_from: from, p_to: to, p_statuses: statuses })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/crm/transfer')
  revalidatePath('/crm/leads')
  return { moved: data as number }
}
