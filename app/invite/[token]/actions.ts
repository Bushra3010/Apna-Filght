'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { friendlyError } from '@/lib/errors'

export async function acceptInvite(form: FormData) {
  const token = String(form.get('token'))
  const supabase = await createClient()
  const { data: org, error } = await supabase.rpc('accept_invite', { p_token: token })
  if (error) redirect(`/invite/${token}?error=${encodeURIComponent(friendlyError(error.message))}`)
  const jar = await cookies()
  jar.set('org', org as string, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  jar.delete('fy')
  redirect('/dashboard')
}
