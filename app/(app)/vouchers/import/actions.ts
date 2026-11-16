'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise, formatINR } from '@/lib/money'
import { byName, date, MAX_ROWS, money, recordBatch, saveMapping, type ImportResult, type RowResult } from '@/lib/import/server'

const Payload = z.object({
  file_name: z.string(),
  mapping_name: z.string(),
  mapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.string())).max(MAX_ROWS, `At most ${MAX_ROWS} rows per file`),
})
const Defaults = z.object({
  kind: z.enum(['receipt', 'payment']),
  cash_bank_ledger_id: z.string().uuid('Choose the cash or bank account'),
  mode: z.enum(['cash', 'cheque', 'bank_transfer', 'upi', 'card']),
})

const MODES: [RegExp, string][] = [[/upi|gpay|phonepe|paytm/i, 'upi'], [/che?q/i, 'cheque'], [/neft|rtgs|imps|bank|transfer|nach/i, 'bank_transfer'], [/card|pos/i, 'card'], [/cash/i, 'cash']]

/** Each row becomes its own receipt / payment, kept on account (adjust against bills afterwards). */
export async function importVouchers(_: ImportResult, form: FormData): Promise<ImportResult> {
  const mode = form.get('mode') === 'commit' ? 'commit' : 'preview'
  let payload: z.infer<typeof Payload>
  try {
    const p = Payload.safeParse(JSON.parse(String(form.get('payload'))))
    if (!p.success) return { error: p.error.issues[0].message }
    payload = p.data
  } catch {
    return { error: 'Could not read the file data. Please choose the file again.' }
  }
  const d = Defaults.safeParse({ kind: form.get('kind'), cash_bank_ledger_id: form.get('cash_bank_ledger_id'), mode: form.get('default_mode') })
  if (!d.success) return { error: d.error.issues[0].message }
  const def = d.data
  if (!payload.rows.length) return { error: 'The file has no rows' }

  const { supabase, org, member, fy } = await getContext()
  const { data: ledgers } = await supabase.from('ledgers').select('id, name, kind').eq('org_id', org.id).eq('is_active', true)
  const find = byName((ledgers ?? []).filter((l) => !['bank', 'cash'].includes(l.kind)))
  if (!(ledgers ?? []).some((l) => l.id === def.cash_bank_ledger_id && ['bank', 'cash'].includes(l.kind))) return { error: 'Choose the cash or bank account' }

  // references already used on this account (re-importing a bank statement is safe)
  const refs = [...new Set(payload.rows.map((r) => (r.reference ?? '').trim()).filter(Boolean))]
  const used = new Set<string>()
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await supabase.from('vouchers').select('reference').eq('org_id', org.id).eq('kind', def.kind)
      .eq('cash_bank_ledger_id', def.cash_bank_ledger_id).neq('status', 'cancelled').in('reference', refs.slice(i, i + 200))
    data?.forEach((v) => v.reference && used.add(v.reference))
  }
  const seen = new Set<string>()

  const prepared = payload.rows.map((r, i) => {
    const errors: string[] = []
    const n = i + 1
    const vdate = date(r.date, 'Date', errors)
    if (!vdate && !errors.length) errors.push('Date is empty')
    if (vdate && (vdate < fy.starts_on || vdate > fy.ends_on)) errors.push(`${vdate} is outside FY ${fy.label}`)
    const amt = toPaise(money(r.amount, 'Amount', errors))
    if (amt <= 0 && !errors.length) errors.push('Amount must be more than zero')
    const partyName = (r.party ?? '').trim()
    const party = find(partyName)
    if (!party) errors.push(partyName ? `“${partyName}” not found under Ledgers` : 'Party is empty')
    const ref = (r.reference ?? '').trim()
    let skip: string | undefined
    if (ref && used.has(ref)) skip = `Reference ${ref} is already entered`
    else if (ref && seen.has(ref)) skip = `Reference ${ref} appears twice in this file`
    if (ref) seen.add(ref)
    const m = MODES.find(([re]) => re.test(r.mode ?? ''))?.[1] ?? def.mode
    return { n, raw: r, errors, skip, label: `${partyName || '—'} · ${amt > 0 ? formatINR(amt) : ''}`.trim(),
      p: { voucher_date: vdate, cash_bank_ledger_id: def.cash_bank_ledger_id, party_ledger_id: party?.id, amount: amt, mode: m, reference: ref || null, narration: (r.narration ?? '').trim() || null, allocations: [] } }
  })
  const results: RowResult[] = prepared.map((p) => ({ n: p.n, label: p.label, status: p.errors.length ? 'error' : p.skip ? 'skip' : 'ok', message: p.errors.join('; ') || p.skip || `${p.p.voucher_date} · ${p.p.mode.replace('_', ' ')}` }))
  const ok = prepared.filter((p) => !p.errors.length && !p.skip)
  const total = ok.reduce((a, p) => a + p.p.amount, 0)
  if (mode === 'preview') return { mode, rows: results, summary: `${ok.length} ${def.kind}(s) ready, ${formatINR(total)}; ${prepared.filter((p) => p.skip).length} skipped; ${prepared.filter((p) => p.errors.length).length} with problems` }
  if (!ok.length) return { mode: 'preview', rows: results, error: 'Nothing to import: fix the rows marked in red' }

  const outcome = new Map<number, { id?: string; no?: string; error?: string }>()
  for (const r of ok) {
    const { data: id, error } = def.kind === 'receipt'
      ? await supabase.rpc('save_receipt', { p_org: org.id, p: r.p })
      : await supabase.rpc('save_voucher', { p_org: org.id, p: { ...r.p, kind: 'payment' } })
    if (error) { outcome.set(r.n, { error: friendlyError(error.message) }); continue }
    const { data: v } = await supabase.from('vouchers').select('voucher_no').eq('id', id as string).single()
    outcome.set(r.n, { id: id as string, no: v?.voucher_no })
  }
  await recordBatch(supabase, org.id, member.id, 'vouchers', payload.mapping_name, payload.file_name,
    prepared.map((p) => ({ n: p.n, raw: p.raw, error: p.errors.join('; ') || p.skip || outcome.get(p.n)?.error, voucher_id: outcome.get(p.n)?.id })))
  if (payload.mapping_name) await saveMapping(supabase, org.id, 'vouchers', payload.mapping_name, payload.mapping, { kind: def.kind, cash_bank_ledger_id: def.cash_bank_ledger_id, default_mode: def.mode })
  revalidatePath(def.kind === 'receipt' ? '/vouchers/receipts' : '/vouchers/payments')
  revalidatePath('/vouchers/adjust')
  revalidatePath('/vouchers/import')
  const made = [...outcome.values()].filter((x) => x.no).length
  return {
    mode, summary: `Created ${made} ${def.kind}(s). Adjust them against bills under Bill adjustment.`,
    rows: results.map((r) => { const x = outcome.get(r.n); return !x ? r : x.error ? { ...r, status: 'error' as const, message: x.error } : { ...r, message: `Saved as ${x.no}` } }),
  }
}
