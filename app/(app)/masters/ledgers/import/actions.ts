'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise, formatINR } from '@/lib/money'
import { LEDGER_GROUP } from '@/lib/ledgers'
import { MAX_ROWS, money, recordBatch, saveMapping, type ImportResult, type RowResult } from '@/lib/import/server'

const Payload = z.object({
  file_name: z.string(),
  mapping_name: z.string(),
  mapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.string())).max(MAX_ROWS, `At most ${MAX_ROWS} rows per file`),
})
const KINDS: [RegExp, string][] = [
  [/supplier|vendor|creditor|airline|consolidator/i, 'supplier'], [/client|customer|debtor|agent|corporate/i, 'customer'],
  [/bank/i, 'bank'], [/cash/i, 'cash'], [/expense/i, 'expense'], [/income/i, 'income'], [/capital/i, 'capital'],
]

/** Creates ledgers that don't exist yet (existing names are skipped) with their opening balance for this year. */
export async function importLedgers(_: ImportResult, form: FormData): Promise<ImportResult> {
  const mode = form.get('mode') === 'commit' ? 'commit' : 'preview'
  let payload: z.infer<typeof Payload>
  try {
    const p = Payload.safeParse(JSON.parse(String(form.get('payload'))))
    if (!p.success) return { error: p.error.issues[0].message }
    payload = p.data
  } catch {
    return { error: 'Could not read the file data. Please choose the file again.' }
  }
  const defKind = String(form.get('default_kind') ?? 'customer')
  if (!LEDGER_GROUP[defKind]) return { error: 'Choose the default type' }
  if (!payload.rows.length) return { error: 'The file has no rows' }

  const { supabase, org, member, fy } = await getContext()
  const [{ data: existing }, { data: states }, { data: groups }] = await Promise.all([
    supabase.from('ledgers').select('name').eq('org_id', org.id),
    supabase.from('states').select('id, name, gst_code').eq('country_code', 'IN'),
    supabase.from('account_groups').select('id, system_key').eq('org_id', org.id).not('system_key', 'is', null),
  ])
  const have = new Set((existing ?? []).map((l) => l.name.trim().toLowerCase()))
  const groupId = new Map((groups ?? []).map((g) => [g.system_key, g.id]))
  const stateBy = (v: string) => {
    const s = v.trim().toLowerCase()
    if (!s) return null
    return (states ?? []).find((x) => x.gst_code === s.padStart(2, '0') || x.name.toLowerCase() === s)?.id ?? undefined
  }
  const seen = new Set<string>()

  const prepared = payload.rows.map((r, i) => {
    const errors: string[] = []
    const n = i + 1
    const name = (r.name ?? '').trim().replace(/\s+/g, ' ')
    if (name.length < 2) errors.push('Name is empty')
    const kind = (r.kind ?? '').trim() ? KINDS.find(([re]) => re.test(r.kind))?.[1] : defKind
    if (!kind) errors.push(`Type “${r.kind}” not recognised (use client, supplier, bank, cash, expense, income or capital)`)
    const gstin = (r.gstin ?? '').trim().toUpperCase()
    if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) errors.push(`GSTIN “${gstin}” must be 15 characters`)
    let state = stateBy(r.state ?? '')
    if (state === undefined) { errors.push(`State “${r.state}” not found`); state = null }
    if (!state && gstin) state = (states ?? []).find((x) => x.gst_code === gstin.slice(0, 2))?.id ?? null
    const credit = (r.credit_days ?? '').trim() ? Number(r.credit_days) : 0
    if (!Number.isInteger(credit) || credit < 0 || credit > 365) errors.push('Credit days must be 0–365')
    const opening = toPaise(money(r.opening, 'Opening balance', errors))
    let skip: string | undefined
    const k = name.toLowerCase()
    if (have.has(k)) skip = 'Already in Ledgers'
    else if (seen.has(k)) skip = 'Appears twice in this file'
    seen.add(k)
    return { n, raw: r, errors, skip, opening, label: name || '—',
      row: { org_id: org.id, group_id: groupId.get(LEDGER_GROUP[kind ?? 'customer']), name, kind, gstin: gstin || null, pan: (r.pan ?? '').trim().toUpperCase() || (gstin ? gstin.slice(2, 12) : null),
        state_id: state, mobile: (r.mobile ?? '').trim() || null, email: (r.email ?? '').trim() || null, address: (r.address ?? '').trim() || null, credit_days: credit } }
  })
  const results: RowResult[] = prepared.map((p) => ({ n: p.n, label: p.label, status: p.errors.length ? 'error' : p.skip ? 'skip' : 'ok',
    message: p.errors.join('; ') || p.skip || `${p.row.kind}${p.opening ? ` · opening ${formatINR(Math.abs(p.opening))} ${p.opening > 0 ? 'Dr' : 'Cr'}` : ''}` }))
  const ok = prepared.filter((p) => !p.errors.length && !p.skip)
  if (mode === 'preview') return { mode, rows: results, summary: `${ok.length} new ledger(s); ${prepared.filter((p) => p.skip).length} skipped; ${prepared.filter((p) => p.errors.length).length} with problems` }
  if (!ok.length) return { mode: 'preview', rows: results, error: 'Nothing to import: fix the rows marked in red' }
  if (fy.is_closed && ok.some((p) => p.opening)) return { error: `FY ${fy.label} is closed: opening balances can't be set. Switch to an open year.` }

  const outcome = new Map<number, { id?: string; error?: string }>()
  for (let i = 0; i < ok.length; i += 200) {
    const chunk = ok.slice(i, i + 200)
    const { data, error } = await supabase.from('ledgers').insert(chunk.map((p) => p.row)).select('id, name')
    if (error) { chunk.forEach((p) => outcome.set(p.n, { error: friendlyError(error.message) })); continue }
    const id = new Map((data ?? []).map((l) => [l.name.toLowerCase(), l.id]))
    chunk.forEach((p) => outcome.set(p.n, { id: id.get(p.row.name.toLowerCase()) }))
  }
  const openings = ok.filter((p) => p.opening && outcome.get(p.n)?.id).map((p) => ({ org_id: org.id, fy_id: fy.id, ledger_id: outcome.get(p.n)!.id!, amount: p.opening }))
  let note = ''
  if (openings.length) {
    const { error } = await supabase.from('opening_balances').upsert(openings, { onConflict: 'fy_id,ledger_id' })
    if (error) note = ` Opening balances not saved: ${friendlyError(error.message)}`
  }
  await recordBatch(supabase, org.id, member.id, 'ledgers', payload.mapping_name, payload.file_name,
    prepared.map((p) => ({ n: p.n, raw: p.raw, error: p.errors.join('; ') || p.skip || outcome.get(p.n)?.error })))
  if (payload.mapping_name) await saveMapping(supabase, org.id, 'ledgers', payload.mapping_name, payload.mapping, { default_kind: defKind })
  revalidatePath('/masters/ledgers')
  revalidatePath('/accounts/opening-balances')
  const made = [...outcome.values()].filter((x) => x.id).length
  return {
    mode, summary: `Created ${made} ledger(s).${note}`,
    rows: results.map((r) => { const x = outcome.get(r.n); return !x ? r : x.error ? { ...r, status: 'error' as const, message: x.error } : { ...r, message: `Created · ${r.message}` } }),
  }
}
