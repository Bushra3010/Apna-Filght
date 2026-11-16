import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseDate, parseMoney } from './values'

export type RowResult = { n: number; status: 'ok' | 'skip' | 'error'; message: string; label: string; amount?: number }
export type ImportResult = { error?: string; mode?: 'preview' | 'commit'; rows?: RowResult[]; summary?: string } | undefined

export const MAX_ROWS = 2000

/** Case-insensitive name → id lookup over a list. */
export function byName<T extends { id: string; name: string }>(list: T[]) {
  const m = new Map(list.map((x) => [x.name.trim().toLowerCase(), x]))
  return (name: string | undefined | null) => (name ? m.get(name.trim().toLowerCase()) : undefined)
}

export const money = (v: unknown, field: string, errs: string[]) => {
  const r = parseMoney(v)
  if (r === null) { errs.push(`${field} “${v}” is not a number`); return '' }
  return r
}

export const date = (v: unknown, field: string, errs: string[]) => {
  if (v === undefined || v === null || String(v).trim() === '') return null
  const d = parseDate(v)
  if (!d) errs.push(`${field} “${v}” is not a date`)
  return d
}

/** Save the column mapping under a name so the next file of this format maps itself. */
export async function saveMapping(supabase: SupabaseClient, orgId: string, target: string, name: string, mapping: Record<string, string>, defaults: Record<string, unknown>) {
  if (!name.trim()) return
  await supabase.from('import_mappings').upsert({ org_id: orgId, target, name: name.trim(), mapping, defaults }, { onConflict: 'org_id,target,name' })
}

/** Record what was imported (history + rows that still need attention). */
export async function recordBatch(
  supabase: SupabaseClient,
  orgId: string,
  memberId: string,
  target: 'billing' | 'vouchers' | 'ledgers',
  format: string,
  fileName: string,
  rows: { n: number; raw: Record<string, string>; error?: string; invoice_id?: string; voucher_id?: string }[],
) {
  const failed = rows.filter((r) => r.error).length
  const { data: batch } = await supabase
    .from('import_batches')
    .insert({ org_id: orgId, target, format: format || 'custom', file_name: fileName, row_count: rows.length, created_by: memberId,
      status: failed === 0 ? 'generated' : failed === rows.length ? 'failed' : 'partially_generated' })
    .select('id')
    .single()
  if (!batch) return
  for (let i = 0; i < rows.length; i += 500) {
    await supabase.from('import_rows').insert(
      rows.slice(i, i + 500).map((r) => ({ org_id: orgId, batch_id: batch.id, row_no: r.n, raw: r.raw, error: r.error ?? null, invoice_id: r.invoice_id ?? null, voucher_id: r.voucher_id ?? null })),
    )
  }
}
