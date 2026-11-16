import 'server-only'
import { getContext, fyRange } from '@/lib/context'
import { normalise } from '@/lib/statements'

export function clampToFy(fy: { starts_on: string; ends_on: string }, v: string | undefined, fallback: string) {
  const x = v || fallback
  return x < fy.starts_on ? fy.starts_on : x > fy.ends_on ? fy.ends_on : x
}

export async function getTrialBalance(fromParam?: string, toParam?: string) {
  const { supabase, org, fy } = await getContext()
  const from = clampToFy(fy, fromParam, fy.starts_on)
  const to = clampToFy(fy, toParam, fyRange(fy).to)
  const { data, error } = await supabase.rpc('trial_balance', { p_org: org.id, p_fy: fy.id, p_from: from, p_to: to })
  if (error) throw new Error(error.message)
  return { rows: normalise((data ?? []) as Record<string, unknown>[]), from, to, fy, org }
}
