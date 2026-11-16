'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getContext } from '@/lib/context'
import { friendlyError } from '@/lib/errors'
import type { FormState } from '@/components/form'

const opt = z.string().trim().transform((v) => (v === '' ? null : v))
const Schema = z.object({
  name: z.string().trim().min(2, 'Enter the company name'),
  legal_name: opt,
  address_line1: opt,
  address_line2: opt,
  state_id: z.string().uuid('Choose the state'),
  pincode: opt,
  phone: opt,
  mobile: opt,
  email: opt,
  gstin: opt.pipe(z.string().regex(/^\d{2}[A-Z0-9]{13}$/, 'GSTIN must be 15 characters').nullable()),
  pan: opt.pipe(z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN must look like ABCDE1234F').nullable()),
  invoice_terms: opt,
})

export async function saveCompany(_: FormState, form: FormData): Promise<FormState & { saved?: boolean }> {
  const raw = Object.fromEntries(form)
  const parsed = Schema.safeParse({ ...raw, gstin: String(raw.gstin ?? '').toUpperCase(), pan: String(raw.pan ?? '').toUpperCase() })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { supabase, org } = await getContext()

  // GSTIN's first two digits must match the state
  if (parsed.data.gstin) {
    const { data: st } = await supabase.from('states').select('gst_code').eq('id', parsed.data.state_id).single()
    if (st && st.gst_code !== parsed.data.gstin.slice(0, 2)) {
      return { error: `GSTIN starts with ${parsed.data.gstin.slice(0, 2)} but the state code is ${st.gst_code}` }
    }
  }
  const { error } = await supabase.from('orgs').update(parsed.data).eq('id', org.id)
  if (error) return { error: friendlyError(error.message) }
  revalidatePath('/', 'layout')
  return { saved: true }
}
