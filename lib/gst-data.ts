import 'server-only'
import { getContext } from '@/lib/context'
import { buildGstr1 } from '@/lib/gst-returns'
import { gstPeriod } from '@/lib/gst-period'

export async function loadGstr1(month?: string) {
  const { supabase, org } = await getContext()
  const p = gstPeriod(month)
  const [sales, hsn, { data: o }] = await Promise.all([
    supabase.rpc('gst_sales_lines', { p_org: org.id, p_from: p.from, p_to: p.to }),
    supabase.rpc('gst_hsn_lines', { p_org: org.id, p_from: p.from, p_to: p.to }),
    supabase.from('orgs').select('gstin').eq('id', org.id).single(),
  ])
  if (sales.error) throw new Error(sales.error.message)
  if (hsn.error) throw new Error(hsn.error.message)
  return { p, gstin: (o?.gstin as string | null) ?? null, g: buildGstr1(sales.data ?? [], hsn.data ?? []) }
}

export async function loadPurchases(month?: string) {
  const { supabase, org } = await getContext()
  const p = gstPeriod(month)
  const { data, error } = await supabase.rpc('gst_purchase_lines', { p_org: org.id, p_from: p.from, p_to: p.to })
  if (error) throw new Error(error.message)
  return (data ?? []) as Record<string, unknown>[]
}
