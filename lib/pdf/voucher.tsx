import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Page, Text, View } from '@react-pdf/renderer'
import { formatAmount, formatINR } from '@/lib/money'
import { amountInWords } from '@/lib/words'
import { CompanyBlock, dateIN, KV, PageFooter, s, type Company } from './kit'
import { loadCompany } from './invoice'

const MODE: Record<string, string> = { cash: 'Cash', cheque: 'Cheque', bank_transfer: 'Bank transfer', upi: 'UPI', card: 'Card', gateway: 'Online', adjustment: 'Adjustment' }

export type VoucherData = {
  v: { id: string; kind: string; voucher_no: string; voucher_date: string; amount: number; mode: string | null; reference: string | null; narration: string | null
    cheque_no: string | null; cheque_date: string | null; cheque_bank: string | null; status: string
    party: { name: string; address: string | null; gstin: string | null } | null; account: { name: string } | null }
  against: { no: string; date: string; amount: number }[]
  company: Company
}

export async function loadVoucher(supabase: SupabaseClient, orgId: string, id: string): Promise<VoucherData | null> {
  const [{ data: v }, { data: alloc }, company] = await Promise.all([
    supabase.from('vouchers')
      .select('id, kind, voucher_no, voucher_date, amount, mode, reference, narration, cheque_no, cheque_date, cheque_bank, status, party:ledgers!vouchers_party_ledger_id_fkey(name, address, gstin), account:ledgers!vouchers_cash_bank_ledger_id_fkey(name)')
      .eq('org_id', orgId).eq('id', id).in('kind', ['receipt', 'payment']).maybeSingle(),
    supabase.from('bill_allocations').select('amount, invoices(invoice_no, invoice_date), purchase_bills(bill_no, bill_date)').eq('org_id', orgId).eq('voucher_id', id),
    loadCompany(supabase, orgId),
  ])
  if (!v || !company) return null
  const against = (alloc ?? []).map((a) => {
    const inv = a.invoices as unknown as { invoice_no: string; invoice_date: string } | null
    const pb = a.purchase_bills as unknown as { bill_no: string; bill_date: string } | null
    return { no: inv?.invoice_no ?? pb?.bill_no ?? '', date: inv?.invoice_date ?? pb?.bill_date ?? '', amount: Number(a.amount) }
  })
  return { v: v as unknown as VoucherData['v'], against, company }
}

export function VoucherPage({ d }: { d: VoucherData }) {
  const { v, against, company: c } = d
  const isReceipt = v.kind === 'receipt'
  const onAccount = Number(v.amount) - against.reduce((a, x) => a + x.amount, 0)
  return (
    <Page size="A5" orientation="landscape" style={s.page}>
      <View style={s.header}>
        <CompanyBlock c={c} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.title}>{isReceipt ? 'RECEIPT' : 'PAYMENT VOUCHER'}</Text>
          <Text>No. <Text style={s.bold}>{v.voucher_no}</Text></Text>
          <Text>Date {dateIN(v.voucher_date)}</Text>
          {v.status === 'cancelled' && <Text style={[s.bold, { color: '#c0392b' }]}>CANCELLED</Text>}
        </View>
      </View>

      <Text style={{ fontSize: 10, lineHeight: 1.5, marginBottom: 8 }}>
        {isReceipt ? 'Received with thanks from ' : 'Paid to '}
        <Text style={s.bold}>{v.party?.name ?? '—'}</Text> the sum of <Text style={s.bold}>{formatINR(v.amount)}</Text> ({amountInWords(v.amount)})
        {' '}by {MODE[v.mode ?? ''] ?? v.mode}{v.account ? ` (${isReceipt ? 'into' : 'from'} ${v.account.name})` : ''}.
      </Text>
      {(v.reference || v.cheque_no) && (
        <Text style={s.muted}>
          {v.cheque_no ? `Cheque ${v.cheque_no}${v.cheque_date ? ` dated ${dateIN(v.cheque_date)}` : ''}${v.cheque_bank ? `, ${v.cheque_bank}` : ''}` : `Reference ${v.reference}`}
        </Text>
      )}
      {v.narration && <Text style={[s.muted, { marginTop: 2 }]}>{v.narration}</Text>}

      <View style={[s.row, s.section, { gap: 24 }]}>
        <View style={{ flex: 1 }}>
          {against.length > 0 && (
            <>
              <Text style={s.label}>Against</Text>
              {against.map((a, i) => <KV key={i} k={`${a.no} · ${dateIN(a.date)}`} v={formatAmount(a.amount)} />)}
              {onAccount > 0 && <KV k="On account" v={formatAmount(onAccount)} />}
            </>
          )}
        </View>
        <View style={{ width: 170 }}>
          <KV k="Amount" v={formatINR(v.amount)} strong top />
        </View>
      </View>
      <Text style={[s.right, s.muted, { marginTop: 24, fontSize: 8 }]}>For {c.legal_name || c.name} — Authorised signatory</Text>
      <PageFooter left={`${v.voucher_no} · computer-generated document`} />
    </Page>
  )
}
