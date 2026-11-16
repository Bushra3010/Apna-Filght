import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/** True when every non-empty id exists in `table` for this company (stops cross-company references). */
export async function ownedBy(
  supabase: SupabaseClient,
  orgId: string,
  table: string,
  ids: (string | null | undefined)[],
): Promise<boolean> {
  const list = [...new Set(ids.filter((v): v is string => !!v))]
  if (!list.length) return true
  const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('id', list)
  return count === list.length
}
