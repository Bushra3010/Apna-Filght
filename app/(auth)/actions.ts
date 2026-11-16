'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { FormState } from '@/components/form'
import { safeNext } from '@/lib/next-path'

const Creds = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Creds.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: error.message }
  redirect(safeNext(form.get('next')) ?? '/dashboard')
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Creds.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const origin = (await headers()).get('origin') ?? ''
  const next = safeNext(form.get('next'))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}` },
  })
  if (error) return { error: error.message }
  if (!data.session) redirect(`/login?check-email=1${next ? `&next=${encodeURIComponent(next)}` : ''}`)
  redirect(next ?? '/onboarding')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
