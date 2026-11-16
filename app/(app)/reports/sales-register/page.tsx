import Link from 'next/link'
import { getContext, fyRange } from '@/lib/context'
import { clampToFy } from '@/lib/reports'
import { BILL_TYPES, BILL_TYPE_KEYS, type BillType } from '@/lib/invoice'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { PeriodForm } from '@/components/period-form'
import { CsvButton } from '@/components/csv-button'

export const metadata = { title: 'Sales register' }

const num = 'px-3 py-1.5 text-right tabular-nums'

export default async function SalesRegisterPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; type?: string }> }) {
  const sp = await searchParams
  const { supabase, org, fy } = await getContext()
  const from = clampToFy(fy, sp.from, fy.starts_on)
  const to = clampToFy(fy, sp.to, fyRange(fy).to)
  const type = BILL_TYPE_KEYS.includes(sp.type as BillType) ? (sp.type as BillType) : undefined

  let q = supabase
    .from('invoices')
    .select('id, doc_kind, bill_type, invoice_no, invoice_date, taxable, igst, cgst, sgst, total, purchase_total, cancel_charges, party:ledgers!invoices_party_ledger_id_fkey(id, name)')
    .eq('org_id', org.id).eq('status', 'posted').in('doc_kind', ['invoice', 'credit_note'])
    .gte('invoice_date', from).lte('invoice_date', to)
    .order('invoice_date').order('invoice_no')
  if (type) q = q.eq('bill_type', type)
  let m = supabase.from('v_invoice_line_margin').select('invoice_id, margin').eq('org_id', org.id).gte('invoice_date', from).lte('invoice_date', to)
  if (type) m = m.eq('bill_type', type)
  const [{ data: docs }, { data: margins }] = await Promise.all([q, m])

  const marginBy = new Map<string, number>()
  for (const x of margins ?? []) marginBy.set(x.invoice_id, (marginBy.get(x.invoice_id) ?? 0) + Number(x.margin))
  const rows = (docs ?? []).map((d) => {
    const s = d.doc_kind === 'credit_note' ? -1 : 1
    const party = d.party as unknown as { id: string; name: string }
    return {
      ...d, s, party, tax: s * (Number(d.igst) + Number(d.cgst) + Number(d.sgst)), taxable: s * Number(d.taxable),
      total: s * Number(d.total), purchase: s * Number(d.purchase_total), margin: s * (marginBy.get(d.id) ?? 0),
    }
  })
  const sum = (k: 'total' | 'tax' | 'taxable' | 'purchase' | 'margin') => rows.reduce((a, r) => a + r[k], 0)

  const byType = new Map<string, { sales: number; margin: number; n: number }>()
  const byParty = new Map<string, { name: string; sales: number; margin: number }>()
  for (const r of rows) {
    const t = byType.get(r.bill_type) ?? { sales: 0, margin: 0, n: 0 }
    t.sales += r.total; t.margin += r.margin; t.n += r.s > 0 ? 1 : 0
    byType.set(r.bill_type, t)
    const p = byParty.get(r.party.id) ?? { name: r.party.name, sales: 0, margin: 0 }
    p.sales += r.total; p.margin += r.margin
    byParty.set(r.party.id, p)
  }
  const top = [...byParty.entries()].sort((a, b) => b[1].sales - a[1].sales).slice(0, 10)
  const charges = rows.filter((r) => r.doc_kind === 'credit_note').reduce((a, r) => a + Number(r.cancel_charges), 0)

  return (
    <>
      <PageHeader title="Sales register" description="Invoices less credit notes, with margin" actions={<CsvButton tableId="sales" filename={`sales-${from}-${to}`} />} />
      <PeriodForm from={from} to={to} min={fy.starts_on} max={fy.ends_on}>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Type
          <select name="type" defaultValue={type ?? ''} className="h-10 rounded-xl border border-input bg-muted px-3 text-sm text-foreground">
            <option value="">All</option>
            {BILL_TYPE_KEYS.map((k) => <option key={k} value={k}>{BILL_TYPES[k].label}</option>)}
          </select>
        </label>
      </PeriodForm>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[['Net sales', sum('total')], ['Taxable value', sum('taxable')], ['GST', sum('tax')], ['Margin', sum('margin')], ['Cancellation charges', charges]].map(([l, v]) => (
          <div key={l as string} className="rounded-3xl bg-card p-5"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold tabular-nums">{formatAmount(v as number)}</p></div>
        ))}
      </div>
      {rows.length ? (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <section className="overflow-x-auto rounded-3xl bg-card">
              <h2 className="border-b px-3 py-2 text-sm font-semibold">By type</h2>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="px-3 py-1.5 text-left font-medium">Type</th><th className="px-3 py-1.5 text-right font-medium">Invoices</th><th className="px-3 py-1.5 text-right font-medium">Sales</th><th className="px-3 py-1.5 text-right font-medium">Margin</th><th className="px-3 py-1.5 text-right font-medium">%</th></tr></thead>
                <tbody>{[...byType.entries()].map(([k, v]) => (
                  <tr key={k} className="border-t"><td className="px-3 py-1.5">{BILL_TYPES[k as BillType]?.label ?? k}</td><td className={num}>{v.n}</td><td className={num}>{formatAmount(v.sales)}</td><td className={num}>{formatAmount(v.margin)}</td><td className={num}>{v.sales ? `${Math.round((v.margin / v.sales) * 100)}%` : ''}</td></tr>
                ))}</tbody>
              </table>
            </section>
            <section className="overflow-x-auto rounded-3xl bg-card">
              <h2 className="border-b px-3 py-2 text-sm font-semibold">Top clients</h2>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="px-3 py-1.5 text-left font-medium">Client</th><th className="px-3 py-1.5 text-right font-medium">Sales</th><th className="px-3 py-1.5 text-right font-medium">Margin</th></tr></thead>
                <tbody>{top.map(([id, v]) => (
                  <tr key={id} className="border-t"><td className="px-3 py-1.5"><Link href={`/accounts/ledger?ledger=${id}`} className="hover:underline">{v.name}</Link></td><td className={num}>{formatAmount(v.sales)}</td><td className={num}>{formatAmount(v.margin)}</td></tr>
                ))}</tbody>
              </table>
            </section>
          </div>
          <div className="overflow-x-auto rounded-3xl bg-card">
            <table id="sales" className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>{['Date', 'Document', 'Type', 'Client', 'Taxable', 'GST', 'Total', 'Purchase', 'Margin'].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i > 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{new Date(r.invoice_date).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-1.5"><Link href={`/billing/invoices/${r.id}`} className="hover:underline">{r.invoice_no}</Link></td>
                    <td className="px-3 py-1.5">{BILL_TYPES[r.bill_type as BillType]?.label ?? r.bill_type}{r.s < 0 && ' (CN)'}</td>
                    <td className="px-3 py-1.5">{r.party.name}</td>
                    <td className={num}>{formatAmount(r.taxable)}</td><td className={num}>{formatAmount(r.tax)}</td><td className={num}>{formatAmount(r.total)}</td>
                    <td className={num}>{formatAmount(r.purchase)}</td>
                    <td className={r.margin < 0 ? `${num} text-destructive` : num}>{formatAmount(r.margin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t font-semibold">
                <tr><td className="px-3 py-2" colSpan={4}>Total</td><td className={num}>{formatAmount(sum('taxable'))}</td><td className={num}>{formatAmount(sum('tax'))}</td><td className={num}>{formatAmount(sum('total'))}</td><td className={num}>{formatAmount(sum('purchase'))}</td><td className={num}>{formatAmount(sum('margin'))}</td></tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <EmptyState>No sales in this period.</EmptyState>
      )}
    </>
  )
}
