'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'

const back = (msg: string, ok = false) => redirect(`/settings/years?${ok ? 'ok' : 'error'}=${encodeURIComponent(msg)}`)

export async function switchYear(form: FormData) {
  const id = String(form.get('fy'))
  const { years } = await getContext()
  if (!years.some((y) => y.id === id)) back('Year not found')
  ;(await cookies()).set('fy', id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function createNextYear() {
  const { supabase, org } = await getContext()
  const { error } = await supabase.rpc('create_next_year', { p_org: org.id })
  if (error) back(friendlyError(error.message))
  revalidatePath('/', 'layout')
  back('Next financial year created', true)
}

export async function carryForward(form: FormData) {
  const { supabase, org } = await getContext()
  const { data, error } = await supabase.rpc('carry_forward', { p_org: org.id, p_from_fy: String(form.get('fy')) })
  if (error) back(friendlyError(error.message))
  const r = data as { ledgers: number; profit: number }
  revalidatePath('/', 'layout')
  back(`Carried forward ${r.ledgers} balances; profit of ₹${(r.profit / 100).toLocaleString('en-IN')} moved to Profit & Loss A/c`, true)
}

export async function closeYear(form: FormData) {
  const { supabase, org } = await getContext()
  const { error } = await supabase.rpc('close_year', { p_org: org.id, p_fy: String(form.get('fy')) })
  if (error) back(friendlyError(error.message))
  revalidatePath('/', 'layout')
  back('Year closed and balances carried forward', true)
}

export async function reopenYear(form: FormData) {
  const { supabase, org } = await getContext()
  const { error } = await supabase.rpc('reopen_year', { p_org: org.id, p_fy: String(form.get('fy')) })
  if (error) back(friendlyError(error.message))
  revalidatePath('/', 'layout')
  back('Year reopened — carry balances forward again once you are done', true)
}
