import Link from 'next/link'
import { loadPurchases } from '@/lib/gst-data'
import { gstPeriod } from '@/lib/gst-period'
import { formatAmount } from '@/lib/money'
import { PageHeader, EmptyState } from '@/components/page-header'
import { GstNav } from '@/components/gst-nav'
import { CsvButton } from '@/components/csv-button'

export const metadata = { title: 'GSTR-2 (purchases)' }

const num = 'px-3 py-1.5 text-right tabular-nums'

export default async function Gstr2Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams
  const p = gstPeriod(month)
  const rows = await loadPurchases(month)
  const n = (v: unknown) => Number(v ?? 0)
  const tot = rows.reduce<Record<string, number>>((a, r) => {
    for (const k of ['taxable', 'igst', 'cgst', 'sgst', 'tds', 'commission', 'total']) a[k] = (a[k] ?? 0) + n(r[k])
    return a
  }, {})
  return (
    <>
      <PageHeader title="GSTR-2 · purchases & input tax" description={`${p.label} · reconcile with GSTR-2B on the portal before claiming ITC`} actions={<CsvButton tableId="gstr2" filename={`gstr2-${p.fp}`} />} />
      <GstNav current="gstr2" month={p.month} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-3xl bg-card p-5"><p className="text-xs text-muted-foreground">Taxable purchases</p><p className="text-lg font-semibold tabular-nums">{formatAmount(tot.taxable ?? 0)}</p></div>
        <div className="rounded-3xl bg-card p-5"><p className="text-xs text-muted-foreground">Input tax (ITC)</p><p className="text-lg font-semibold tabular-nums">{formatAmount((tot.igst ?? 0) + (tot.cgst ?? 0) + (tot.sgst ?? 0))}</p></div>
        <div className="rounded-3xl bg-card p-5"><p className="text-xs text-muted-foreground">TDS</p><p className="text-lg font-semibold tabular-nums">{formatAmount(tot.tds ?? 0)}</p></div>
        <div className="rounded-3xl bg-card p-5"><p className="text-xs text-muted-foreground">Commission earned</p><p className="text-lg font-semibold tabular-nums">{formatAmount(tot.commission ?? 0)}</p></div>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-3xl bg-card">
          <table id="gstr2" className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>{['Supplier', 'GSTIN', 'Our doc', 'Date', 'Supplier bill', 'Rate', 'Taxable', 'IGST', 'CGST', 'SGST', 'TDS', 'Commission', 'Payable'].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i > 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{String(r.supplier_name)}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{(r.supplier_gstin as string) ?? ''}</td>
                  <td className="px-3 py-1.5"><Link href={r.source === 'invoice' ? `/billing/invoices/${r.doc_id}` : `/purchase/general/${r.doc_id}`} className="hover:underline">{String(r.doc_no)}</Link></td>
                  <td className="px-3 py-1.5">{new Date(String(r.doc_date)).toLocaleDateString('en-IN')}</td>
                  <td className="px-3 py-1.5">{(r.supplier_bill_no as string) ?? ''}</td>
                  <td className={num}>{r.gst_rate === null ? '—' : `${n(r.gst_rate)}%`}</td>
                  {(['taxable', 'igst', 'cgst', 'sgst', 'tds', 'commission', 'total'] as const).map((k) => <td key={k} className={num}>{formatAmount(n(r[k]))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No purchases in this period.</EmptyState>
      )}
    </>
  )
}
