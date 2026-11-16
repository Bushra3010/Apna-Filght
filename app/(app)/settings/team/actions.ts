'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { MODULES } from '@/lib/permissions'
import type { FormState } from '@/components/form'

type InviteState = { error?: string; link?: string } | undefined

export async function inviteMember(_: InviteState, form: FormData): Promise<InviteState> {
  const email = String(form.get('email') ?? '').trim()
  const role = String(form.get('role_id') ?? '')
  if (!z.email().safeParse(email).success) return { error: 'Enter a valid email' }
  const { supabase, org } = await getContext()
  const { data: token, error } = await supabase.rpc('invite_member', { p_org: org.id, p_email: email, p_role: role })
  if (error) return { error: friendlyError(error.message) }
  const h = await headers()
  const origin = h.get('origin') ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`
  revalidatePath('/settings/team')
  return { link: `${origin}/invite/${token}` }
}

export async function revokeInvite(form: FormData) {
  const { supabase, org } = await getContext()
  await supabase.rpc('revoke_invite', { p_org: org.id, p_invite: String(form.get('id')) })
  revalidatePath('/settings/team')
}

export async function updateMember(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, org } = await getContext()
  const { error } = await supabase.rpc('update_member', {
    p_org: org.id,
    p_member: String(form.get('member_id')),
    p: {
      display_name: String(form.get('display_name') ?? ''),
      designation: String(form.get('designation') ?? ''),
      mobile: String(form.get('mobile') ?? ''),
      role_id: String(form.get('role_id') ?? ''),
      reports_to: String(form.get('reports_to') ?? ''),
      is_active: form.get('is_active') === 'on',
    },
  })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/settings/team')
  return undefined
}

export async function saveRole(_: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id') ?? '') || null
  const name = String(form.get('name') ?? '').trim()
  const permissions: Record<string, string[]> = {}
  for (const m of MODULES) {
    const acts = m.actions.filter((a) => form.get(`${m.key}:${a}`) === 'on')
    if (acts.length) permissions[m.key] = [...acts]
  }
  const { supabase, org } = await getContext()
  const { error } = await supabase.rpc('save_role', { p_org: org.id, p_id: id, p_name: name, p_permissions: permissions })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/settings/team')
  return undefined
}
