import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AppContext = Awaited<ReturnType<typeof getContext>>

/**
 * The signed-in user, their active company and financial year.
 * Sends the visitor to /login or /onboarding when either is missing.
 * Cached per request, so every server component can call it.
 */
export const getContext = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: members, error } = await supabase
    .from('org_members')
    .select('id, org_id, display_name, orgs(id, name, state_id, gstin)')
    .eq('user_id', user.id)
    .eq('is_active', true)
  if (error) throw new Error(error.message)
  if (!members?.length) redirect('/onboarding')

  const jar = await cookies()
  const member = members.find((m) => m.org_id === jar.get('org')?.value) ?? members[0]
  const org = member.orgs as unknown as { id: string; name: string; state_id: string | null; gstin: string | null }

  const { data: years } = await supabase
    .from('financial_years')
    .select('id, label, starts_on, ends_on, is_closed')
    .eq('org_id', org.id)
    .order('starts_on', { ascending: false })
  if (!years?.length) throw new Error('This company has no financial year')
  const today = new Date().toISOString().slice(0, 10)
  const fy =
    years.find((y) => y.id === jar.get('fy')?.value) ??
    years.find((y) => y.starts_on <= today && today <= y.ends_on) ??
    years[0]

  return {
    supabase,
    user: { id: user.id, email: user.email ?? '' },
    member: { id: member.id, name: member.display_name },
    org,
    fy,
    years,
    companies: members.map((m) => ({ id: m.org_id, name: (m.orgs as unknown as { name: string }).name })),
  }
})

/** Clamp a date to the active financial year (for default report ranges). */
export function fyRange(fy: { starts_on: string; ends_on: string }) {
  const today = new Date().toISOString().slice(0, 10)
  return { from: fy.starts_on, to: today < fy.ends_on ? (today > fy.starts_on ? today : fy.starts_on) : fy.ends_on }
}
