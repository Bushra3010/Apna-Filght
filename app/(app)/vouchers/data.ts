import 'server-only'
import { getContext } from '@/lib/context'

export type LedgerOpt = { id: string; name: string; kind: string }

export async function getAllLedgers() {
  const { supabase, org } = await getContext()
  const { data } = await supabase.from('ledgers').select('id, name, kind').eq('org_id', org.id).eq('is_active', true).order('name')
  return (data ?? []) as LedgerOpt[]
}

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
