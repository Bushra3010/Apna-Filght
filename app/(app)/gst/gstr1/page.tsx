import Link from 'next/link'
import { loadGstr1 } from '@/lib/gst-data'
import { gstr1Json, type Doc } from '@/lib/gst-returns'
import { formatAmount } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { GstNav } from '@/components/gst-nav'
import { JsonDownload } from '@/components/json-download'
import { CsvButton } from '@/components/csv-button'

export const metadata = { title: 'GSTR-1' }

const th = 'px-3 py-2 font-medium'
const num = 'px-3 py-1.5 text-right tabular-nums'

function DocTable({ id, docs, showGstin, cn }: { id: string; docs: Doc[]; showGstin?: boolean; cn?: boolean }) {
  return (
    <table id={id} className="w-full text-sm">
      <thead className="border-b text-xs text-muted-foreground">
        <tr>
          {showGstin && <th className={`${th} text-left`}>GSTIN</th>}
          <th className={`${th} text-left`}>{cn ? 'Note' : 'Invoice'}</th><th className={`${th} text-left`}>Date</th>
          {cn && <th className={`${th} text-left`}>Type</th>}
          {cn && <th className={`${th} text-left`}>Against</th>}
          <th className={`${th} text-left`}>Party</th><th className={`${th} text-left`}>POS</th>
          <th className={`${th} text-right`}>Value</th><th className={`${th} text-right`}>Taxable</th>
          <th className={`${th} text-right`}>IGST</th><th className={`${th} text-right`}>CGST</th><th className={`${th} text-right`}>SGST</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.id} className="border-b last:border-0">
            {showGstin && <td className="px-3 py-1.5 font-mono text-xs">{d.gstin}</td>}
            <td className="px-3 py-1.5"><Link href={`/billing/invoices/${d.id}`} className="hover:underline">{d.no}</Link></td>
            <td className="px-3 py-1.5">{new Date(d.date).toLocaleDateString('en-IN')}</td>
            {cn && <td className="px-3 py-1.5">{d.note === 'D' ? 'Debit' : 'Credit'}</td>}
            {cn && <td className="px-3 py-1.5">{d.ref_no}</td>}
            <td className="px-3 py-1.5">{d.party}</td><td className="px-3 py-1.5">{d.pos}</td>
            <td className={num}>{formatAmount(d.value)}</td><td className={num}>{formatAmount(d.taxable)}</td>
            <td className={num}>{formatAmount(d.igst)}</td><td className={num}>{formatAmount(d.cgst)}</td><td className={num}>{formatAmount(d.sgst)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Section({ title, hint, id, count, children }: { title: string; hint: string; id: string; count: number; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-end justify-between gap-2">
        <div><h2 className="font-medium">{title} <span className="text-muted-foreground">({count})</span></h2><p className="text-xs text-muted-foreground">{hint}</p></div>
        {count > 0 && <CsvButton tableId={id} filename={id} />}
      </div>
      {count > 0 ? <div className="overflow-x-auto rounded-3xl bg-card">{children}</div> : <p className="text-sm text-muted-foreground">None.</p>}
    </section>
  )
}

export default async function Gstr1Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams
  const { p, gstin, g } = await loadGstr1(month)
  const json = gstin ? gstr1Json(g, gstin, p.fp) : null
  const cards = [
    ['B2B', g.totals.b2b, g.b2b.length], ['B2CL', g.totals.b2cl, g.b2cl.length], ['B2CS', g.totals.b2cs, g.b2cs.length],
    ['Notes (net)', [...g.cdnr, ...g.cdnur].reduce((a, n) => { const s = n.note === 'D' ? 1 : -1; return { taxable: a.taxable + s * n.taxable, igst: a.igst + s * n.igst, cgst: a.cgst + s * n.cgst, sgst: a.sgst + s * n.sgst } }, { taxable: 0, igst: 0, cgst: 0, sgst: 0 }), g.cdnr.length + g.cdnur.length],
  ] as const

  return (
    <>
      <PageHeader
        title="GSTR-1"
        description={`Outward supplies · ${p.label}`}
        actions={<JsonDownload data={json} filename={`GSTR1_${gstin ?? 'NOGSTIN'}_${p.fp}.json`} disabled={!json} />}
      />
      <GstNav current="gstr1" month={p.month} />
      {!gstin && (
        <p className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Add your GSTIN under <Link href="/settings/company" className="underline">Settings → Company</Link> to download the JSON.
        </p>
      )}
      {g.warnings.length > 0 && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {g.warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map(([label, t, c]) => (
          <div key={label} className="rounded-3xl bg-card p-5">
            <p className="text-xs text-muted-foreground">{label} · {c}</p>
            <p className="text-lg font-semibold tabular-nums">{formatAmount(t.taxable)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">tax {formatAmount(t.igst + t.cgst + t.sgst)}</p>
          </div>
        ))}
        <div className="rounded-3xl bg-card p-5">
          <p className="text-xs text-muted-foreground">Net tax liability</p>
          <p className="text-lg font-semibold tabular-nums">{formatAmount(g.net.igst + g.net.cgst + g.net.sgst)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">on {formatAmount(g.net.taxable)}</p>
        </div>
      </div>

      <div className="grid gap-8">
        <Section title="4A · B2B invoices" hint="Clients with a GSTIN" id="b2b" count={g.b2b.length}><DocTable id="b2b" docs={g.b2b} showGstin /></Section>
        <Section title="5 · B2C large" hint="Unregistered, inter-state, above ₹1 lakh" id="b2cl" count={g.b2cl.length}><DocTable id="b2cl" docs={g.b2cl} /></Section>
        <Section title="7 · B2C others" hint="Summarised by place of supply and rate, after small credit notes" id="b2cs" count={g.b2cs.length}>
          <table id="b2cs" className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground"><tr><th className={`${th} text-left`}>Type</th><th className={`${th} text-left`}>POS</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Taxable</th><th className={`${th} text-right`}>IGST</th><th className={`${th} text-right`}>CGST</th><th className={`${th} text-right`}>SGST</th></tr></thead>
            <tbody>
              {g.b2cs.map((r) => (
                <tr key={`${r.pos}-${r.rate}-${r.inter}`} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{r.inter ? 'Inter-state' : 'Intra-state'}</td><td className="px-3 py-1.5">{r.pos}</td><td className={num}>{r.rate}%</td>
                  <td className={num}>{formatAmount(r.taxable)}</td><td className={num}>{formatAmount(r.igst)}</td><td className={num}>{formatAmount(r.cgst)}</td><td className={num}>{formatAmount(r.sgst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="9B · Credit / debit notes — registered (CDNR)" hint="Cancellations for clients with a GSTIN; a note that only adds GST (charges) is a debit note" id="cdnr" count={g.cdnr.length}><DocTable id="cdnr" docs={g.cdnr} showGstin cn /></Section>
        <Section title="9B · Credit / debit notes — unregistered (CDNUR)" hint="Against B2C large invoices" id="cdnur" count={g.cdnur.length}><DocTable id="cdnur" docs={g.cdnur} cn /></Section>
        <Section title="8 · Nil-rated / exempt" hint="Bills of supply" id="nil" count={g.nil.length}>
          <table id="nil" className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground"><tr><th className={`${th} text-left`}>Supply type</th><th className={`${th} text-right`}>Exempt</th></tr></thead>
            <tbody>{g.nil.map((x) => <tr key={x.type} className="border-b last:border-0"><td className="px-3 py-1.5">{x.type}</td><td className={num}>{formatAmount(x.exempt)}</td></tr>)}</tbody>
          </table>
        </Section>
        <Section title="12 · HSN / SAC summary" hint="B2B and B2C reported separately" id="hsn" count={g.hsn.length}>
          <table id="hsn" className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground"><tr><th className={`${th} text-left`}>Tab</th><th className={`${th} text-left`}>SAC</th><th className={`${th} text-left`}>Description</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Value</th><th className={`${th} text-right`}>Taxable</th><th className={`${th} text-right`}>IGST</th><th className={`${th} text-right`}>CGST</th><th className={`${th} text-right`}>SGST</th></tr></thead>
            <tbody>
              {g.hsn.map((h) => (
                <tr key={`${h.sac}-${h.rate}-${h.b2b}`} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{h.b2b ? 'B2B' : 'B2C'}</td><td className="px-3 py-1.5 font-mono">{h.sac}</td><td className="px-3 py-1.5">{h.desc}</td><td className={num}>{h.rate}%</td>
                  <td className={num}>{formatAmount(h.value)}</td><td className={num}>{formatAmount(h.taxable)}</td><td className={num}>{formatAmount(h.igst)}</td><td className={num}>{formatAmount(h.cgst)}</td><td className={num}>{formatAmount(h.sgst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Check the figures and import the JSON into the GST portal or offline tool before filing. SAC codes are assigned by service type; ask your CA to confirm them for your business.
      </p>
    </>
  )
}
