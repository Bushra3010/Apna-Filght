'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import type { FormState } from '@/components/form'

const cookieOpts = { path: '/', httpOnly: true, sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 365 }

export async function switchCompany(form: FormData) {
  const id = String(form.get('org'))
  const { companies } = await getContext()
  if (!companies.some((c) => c.id === id)) redirect('/settings/companies')
  const jar = await cookies()
  jar.set('org', id, cookieOpts)
  jar.delete('fy') // years belong to a company
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

const NewCompany = z.object({
  name: z.string().trim().min(2, 'Enter the company name'),
  state: z.string().regex(/^\d{2}$/, 'Choose the state'),
  fy_start: z.iso.date('Choose the financial year start'),
})

export async function addCompany(_: FormState, form: FormData): Promise<FormState> {
  const p = NewCompany.safeParse(Object.fromEntries(form))
  if (!p.success) return { error: p.error.issues[0].message }
  const { supabase } = await getContext()
  const { data, error } = await supabase.rpc('create_org', { p_name: p.data.name, p_state_gst_code: p.data.state, p_fy_start: p.data.fy_start })
  if (error) return { error: friendlyError(error.message) }
  const jar = await cookies()
  jar.set('org', data as string, cookieOpts)
  jar.delete('fy')
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
