import { loadGstr1, loadPurchases } from '@/lib/gst-data'
import { buildGstr3b } from '@/lib/gst-returns'
import { formatAmount } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { PrintButton } from '@/components/print-button'
import { GstNav } from '@/components/gst-nav'

export const metadata = { title: 'GSTR-3B' }

const num = 'px-3 py-2 text-right tabular-nums'

export default async function Gstr3bPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams
  const [{ p, g }, purchases] = await Promise.all([loadGstr1(month), loadPurchases(month)])
  const b = buildGstr3b(g, purchases)
  const row = (label: string, t: { taxable?: number; igst: number; cgst: number; sgst: number }, strong?: boolean) => (
    <tr className={strong ? 'border-t font-semibold' : 'border-b'}>
      <td className="px-3 py-2">{label}</td>
      <td className={num}>{t.taxable === undefined ? '' : formatAmount(t.taxable)}</td>
      <td className={num}>{formatAmount(t.igst)}</td><td className={num}>{formatAmount(t.cgst)}</td><td className={num}>{formatAmount(t.sgst)}</td>
    </tr>
  )
  const head = (
    <thead className="border-b text-xs text-muted-foreground">
      <tr><th className="px-3 py-2 text-left font-medium">Nature</th><th className="px-3 py-2 text-right font-medium">Taxable value</th><th className="px-3 py-2 text-right font-medium">IGST</th><th className="px-3 py-2 text-right font-medium">CGST</th><th className="px-3 py-2 text-right font-medium">SGST</th></tr>
    </thead>
  )
  const pos = (x: number) => Math.max(x, 0)
  return (
    <>
      <PageHeader title="GSTR-3B summary" description={`${p.label} · figures to enter on the GST portal`} actions={<PrintButton />} />
      <GstNav current="gstr3b" month={p.month} />
      <div className="grid max-w-4xl gap-6">
        <section className="overflow-x-auto rounded-3xl bg-card">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">3.1 Outward supplies</h2>
          <table className="w-full text-sm">
            {head}
            <tbody>
              {row('(a) Taxable supplies (net of credit notes)', b.outward)}
              {row('(c) Nil-rated / exempt', { taxable: b.exempt, igst: 0, cgst: 0, sgst: 0 })}
            </tbody>
          </table>
        </section>
        {b.interB2c.length > 0 && (
          <section className="overflow-x-auto rounded-3xl bg-card">
            <h2 className="border-b px-3 py-2 text-sm font-semibold">3.2 Inter-state supplies to unregistered persons</h2>
            <table className="w-full text-sm">
              <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Place of supply</th><th className="px-3 py-2 text-right font-medium">Taxable value</th><th className="px-3 py-2 text-right font-medium">IGST</th></tr></thead>
              <tbody>{b.interB2c.map((x) => <tr key={x.pos} className="border-b last:border-0"><td className="px-3 py-2">{x.pos}</td><td className={num}>{formatAmount(x.taxable)}</td><td className={num}>{formatAmount(x.igst)}</td></tr>)}</tbody>
            </table>
          </section>
        )}
        <section className="overflow-x-auto rounded-3xl bg-card">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">4 Eligible ITC — (A)(5) all other ITC</h2>
          <table className="w-full text-sm">{head}<tbody>{row('Input tax on purchases', b.itc)}</tbody></table>
        </section>
        <section className="overflow-x-auto rounded-3xl bg-card">
          <h2 className="border-b px-3 py-2 text-sm font-semibold">Tax payable (before cross-utilisation)</h2>
          <table className="w-full text-sm">
            {head}
            <tbody>
              {row('Output tax', { igst: b.outward.igst, cgst: b.outward.cgst, sgst: b.outward.sgst })}
              {row('Less ITC', { igst: -b.itc.igst, cgst: -b.itc.cgst, sgst: -b.itc.sgst })}
              {row('Net (negative = credit carried forward)', b.payable, true)}
            </tbody>
          </table>
        </section>
        <p className="text-xs text-muted-foreground">
          Cash to pay is roughly {formatAmount(pos(b.payable.igst) + pos(b.payable.cgst) + pos(b.payable.sgst))}, before IGST credit is set off against CGST/SGST.
          Claim ITC only for invoices that appear in your GSTR-2B.
        </p>
      </div>
    </>
  )
}
