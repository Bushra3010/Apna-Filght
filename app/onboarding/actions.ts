'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { friendlyError } from '@/lib/errors'
import type { FormState } from '@/components/form'

const Schema = z.object({
  name: z.string().trim().min(2, 'Enter your company name'),
  state: z.string().regex(/^\d{2}$/, 'Choose your state'),
  fy_start: z.iso.date('Choose the financial year start'),
})

export async function createCompany(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_org', {
    p_name: parsed.data.name,
    p_state_gst_code: parsed.data.state,
    p_fy_start: parsed.data.fy_start,
  })
  if (error) return { error: friendlyError(error.message) }
  ;(await cookies()).set('org', data as string, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  redirect('/dashboard')
}
