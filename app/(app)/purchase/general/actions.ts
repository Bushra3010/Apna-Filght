'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import { toPaise } from '@/lib/money'
import { computeTax } from '@/lib/gst'
import type { FormState } from '@/components/form'

const amt = z.string().refine((v) => v.trim() === '' || (Number.isFinite(Number(v.replace(/,/g, ''))) && Number(v.replace(/,/g, '')) >= 0), 'Amounts must be zero or more')

const Bill = z.object({
  id: z.string().optional(),
  supplier_ledger_id: z.string().uuid('Choose the supplier'),
  bill_date: z.iso.date('Choose the bill date'),
  supplier_bill_no: z.string().trim(),
  supplier_bill_date: z.string(),
  place_of_supply_state_id: z.string().uuid('Choose the place of supply'),
  tds: amt,
  notes: z.string().trim(),
  lines: z
    .array(z.object({ ledger_id: z.string(), description: z.string().trim(), taxable: amt, gst_rate: z.enum(['0', '5', '12', '18', '28']) }))
    .min(1, 'Add at least one line'),
})

export async function savePurchaseBill(_: FormState, form: FormData): Promise<FormState> {
  let json: unknown
  try {
    json = JSON.parse(String(form.get('payload')))
  } catch {
    return { error: 'Could not read the form. Please reload and try again.' }
  }
  const parsed = Bill.safeParse(json)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const b = parsed.data
  const { supabase, org } = await getContext()
  const { data: o } = await supabase.from('orgs').select('state_id').eq('id', org.id).single()
  const inter = !!o?.state_id && o.state_id !== b.place_of_supply_state_id

  const lines = []
  for (const [i, l] of b.lines.entries()) {
    const taxable = toPaise(l.taxable)
    if (!l.ledger_id && !taxable) continue
    if (!l.ledger_id) return { error: `Line ${i + 1}: choose the expense account` }
    if (taxable <= 0) return { error: `Line ${i + 1}: enter the amount` }
    const t = computeTax(taxable, Number(l.gst_rate), inter)
    lines.push({ ledger_id: l.ledger_id, description: l.description || null, taxable, gst_rate: Number(l.gst_rate), ...t, amount: taxable + t.cgst + t.sgst + t.igst })
  }
  if (!lines.length) return { error: 'Add at least one line' }

  const { data: id, error } = await supabase.rpc('save_purchase_bill', {
    p_org: org.id,
    p_header: {
      id: b.id,
      supplier_ledger_id: b.supplier_ledger_id,
      bill_date: b.bill_date,
      supplier_bill_no: b.supplier_bill_no || null,
      supplier_bill_date: b.supplier_bill_date || null,
      place_of_supply_state_id: b.place_of_supply_state_id,
      tds: toPaise(b.tds),
      notes: b.notes || null,
    },
    p_lines: lines,
  })
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/purchase/general')
  redirect(`/purchase/general/${id}`)
}
