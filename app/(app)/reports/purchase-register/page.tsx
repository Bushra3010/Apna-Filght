import Link from 'next/link'
import { getContext, fyRange } from '@/lib/context'
import { clampToFy } from '@/lib/reports'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { PeriodForm } from '@/components/period-form'
import { CsvButton } from '@/components/csv-button'

export const metadata = { title: 'Purchase register' }

const num = 'px-3 py-1.5 text-right tabular-nums'
const KEYS = ['taxable', 'igst', 'cgst', 'sgst', 'tds', 'commission', 'total'] as const

export default async function PurchaseRegisterPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams
  const { supabase, org, fy } = await getContext()
  const from = clampToFy(fy, sp.from, fy.starts_on)
  const to = clampToFy(fy, sp.to, fyRange(fy).to)
  const { data } = await supabase.rpc('gst_purchase_lines', { p_org: org.id, p_from: from, p_to: to })
  const rows = (data ?? []) as Record<string, string | number | null>[]
  const n = (v: unknown) => Number(v ?? 0)
  const tot = Object.fromEntries(KEYS.map((k) => [k, rows.reduce((a, r) => a + n(r[k]), 0)]))
  const bySupplier = new Map<string, { name: string; total: number; gst: number; n: number }>()
  for (const r of rows) {
    const s = bySupplier.get(String(r.supplier_id)) ?? { name: String(r.supplier_name), total: 0, gst: 0, n: 0 }
    s.total += n(r.total); s.gst += n(r.igst) + n(r.cgst) + n(r.sgst); s.n += 1
    bySupplier.set(String(r.supplier_id), s)
  }
  return (
    <>
      <PageHeader title="Purchase register" description="Supplier bills and ticket purchases" actions={<CsvButton tableId="purchases" filename={`purchases-${from}-${to}`} />} />
      <PeriodForm from={from} to={to} min={fy.starts_on} max={fy.ends_on} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Payable to suppliers', tot.total], ['Taxable', tot.taxable], ['Input GST', tot.igst + tot.cgst + tot.sgst], ['Commission earned', tot.commission]].map(([l, v]) => (
          <div key={l as string} className="rounded-3xl bg-card p-5"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold tabular-nums">{formatAmount(v as number)}</p></div>
        ))}
      </div>
      {rows.length ? (
        <>
          <section className="mb-6 max-w-2xl overflow-x-auto rounded-3xl bg-card">
            <h2 className="border-b px-3 py-2 text-sm font-semibold">By supplier</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="px-3 py-1.5 text-left font-medium">Supplier</th><th className="px-3 py-1.5 text-right font-medium">Documents</th><th className="px-3 py-1.5 text-right font-medium">GST</th><th className="px-3 py-1.5 text-right font-medium">Payable</th></tr></thead>
              <tbody>{[...bySupplier.entries()].sort((a, b) => b[1].total - a[1].total).map(([id, s]) => (
                <tr key={id} className="border-t"><td className="px-3 py-1.5"><Link href={`/accounts/ledger?ledger=${id}`} className="hover:underline">{s.name}</Link></td><td className={num}>{s.n}</td><td className={num}>{formatAmount(s.gst)}</td><td className={num}>{formatAmount(s.total)}</td></tr>
              ))}</tbody>
            </table>
          </section>
          <div className="overflow-x-auto rounded-3xl bg-card">
            <table id="purchases" className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>{['Date', 'Document', 'Supplier', 'Supplier bill', 'Taxable', 'IGST', 'CGST', 'SGST', 'TDS', 'Commission', 'Payable'].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i > 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{new Date(String(r.doc_date)).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-1.5"><Link href={r.source === 'invoice' ? `/billing/invoices/${r.doc_id}` : `/purchase/general/${r.doc_id}`} className="hover:underline">{String(r.doc_no)}</Link></td>
                    <td className="px-3 py-1.5">{String(r.supplier_name)}</td>
                    <td className="px-3 py-1.5">{r.supplier_bill_no ?? ''}</td>
                    {KEYS.map((k) => <td key={k} className={num}>{formatAmount(n(r[k]))}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t font-semibold"><tr><td className="px-3 py-2" colSpan={4}>Total</td>{KEYS.map((k) => <td key={k} className={num}>{formatAmount(tot[k])}</td>)}</tr></tfoot>
            </table>
          </div>
        </>
      ) : (
        <EmptyState>No purchases in this period.</EmptyState>
      )}
    </>
  )
}
