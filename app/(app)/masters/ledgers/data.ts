import 'server-only'
import { getContext } from '@/lib/context'

export async function getStates() {
  const { supabase } = await getContext()
  const { data } = await supabase.from('states').select('id, name, gst_code').not('gst_code', 'is', null).order('name')
  return (data ?? []) as { id: string; name: string; gst_code: string }[]
}
