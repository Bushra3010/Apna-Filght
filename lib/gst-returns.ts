// GSTR-1 / GSTR-3B builders. Pure functions over rows from gst_sales_lines,
// gst_hsn_lines and gst_purchase_lines. Amounts in paise in, rupees in JSON.
//
// Rules used (verify with your CA; GSTN changes formats from time to time):
// - B2B: recipient has a GSTIN.
// - B2CL: no GSTIN, inter-state, invoice value above ₹1,00,000 (limit since Aug 2024).
// - B2CS: every other unregistered supply, summarised by place of supply and rate.
// - CDNR: credit notes to registered clients. CDNUR: credit notes against B2CL
//   invoices. Other unregistered credit notes reduce B2CS.
// - Bill of supply (no GST) is reported as exempt in the NIL table.
// - SAC codes come from SAC_FOR_SERVICE below.

export const B2CL_LIMIT = 100000 * 100 // paise

export const SAC_FOR_SERVICE: Record<string, { sac: string; desc: string }> = {
  flight: { sac: '998551', desc: 'Reservation services for transportation' },
  train: { sac: '998551', desc: 'Reservation services for transportation' },
  bus: { sac: '998551', desc: 'Reservation services for transportation' },
  domestic: { sac: '998551', desc: 'Reservation services for transportation' },
  international: { sac: '998551', desc: 'Reservation services for transportation' },
  train_bus: { sac: '998551', desc: 'Reservation services for transportation' },
  hotel: { sac: '998552', desc: 'Reservation services for accommodation' },
  tour: { sac: '998555', desc: 'Tour operator services' },
  visa: { sac: '998559', desc: 'Other travel arrangement services' },
  insurance: { sac: '998559', desc: 'Other travel arrangement services' },
  visa_insurance: { sac: '998559', desc: 'Other travel arrangement services' },
  taxi: { sac: '996601', desc: 'Rental of passenger vehicles with operator' },
  misc: { sac: '998599', desc: 'Other support services' },
  misc_service: { sac: '998599', desc: 'Other support services' },
  commission: { sac: '998551', desc: 'Reservation services for transportation' },
}

export type SalesLine = {
  invoice_id: string
  doc_kind: 'invoice' | 'credit_note'
  bill_type: string
  invoice_no: string
  invoice_date: string
  total: number
  party_name: string
  party_gstin: string | null
  pos_code: string
  is_interstate: boolean
  ref_no: string | null
  ref_date: string | null
  ref_total: number | null
  gst_rate: number
  taxable: number
  igst: number
  cgst: number
  sgst: number
  exempt: number
}

export type HsnLine = { service: string; registered: boolean; gst_rate: number; doc_kind: string; total: number; taxable: number; igst: number; cgst: number; sgst: number }

export type PurchaseLine = { igst: number; cgst: number; sgst: number; taxable: number; tds: number }

type Amt = { taxable: number; igst: number; cgst: number; sgst: number }
const zero = (): Amt => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0 })
const add = (a: Amt, b: Amt, s = 1) => {
  a.taxable += s * b.taxable
  a.igst += s * b.igst
  a.cgst += s * b.cgst
  a.sgst += s * b.sgst
}

export type Doc = Amt & {
  id: string
  no: string
  date: string
  value: number
  party: string
  gstin: string | null
  pos: string
  inter: boolean
  ref_no: string | null
  ref_date: string | null
  rates: (Amt & { rate: number })[]
}
export type B2csRow = Amt & { pos: string; rate: number; inter: boolean }
export type NilRow = { type: 'INTRB2B' | 'INTRB2C' | 'INTRAB2B' | 'INTRAB2C'; exempt: number }
export type HsnRow = Amt & { sac: string; desc: string; rate: number; value: number; b2b: boolean }

const n = (v: unknown) => Number(v ?? 0)

export function buildGstr1(salesRaw: Record<string, unknown>[], hsnRaw: Record<string, unknown>[]) {
  const lines: SalesLine[] = salesRaw.map((r) => ({
    ...(r as unknown as SalesLine),
    total: n(r.total), ref_total: r.ref_total === null ? null : n(r.ref_total), gst_rate: n(r.gst_rate),
    taxable: n(r.taxable), igst: n(r.igst), cgst: n(r.cgst), sgst: n(r.sgst), exempt: n(r.exempt),
  }))

  // documents
  const docs = new Map<string, Doc & { kind: string; bill_type: string; ref_total: number | null }>()
  for (const l of lines) {
    let d = docs.get(l.invoice_id)
    if (!d) {
      d = {
        id: l.invoice_id, kind: l.doc_kind, bill_type: l.bill_type, no: l.invoice_no, date: l.invoice_date, value: l.total,
        party: l.party_name, gstin: l.party_gstin, pos: l.pos_code, inter: l.is_interstate, ref_no: l.ref_no, ref_date: l.ref_date,
        ref_total: l.ref_total, rates: [], ...zero(),
      }
      docs.set(l.invoice_id, d)
    }
    if (l.bill_type === 'bill_of_supply') continue
    const amt = { taxable: l.taxable, igst: l.igst, cgst: l.cgst, sgst: l.sgst }
    if (amt.taxable === 0 && amt.igst === 0 && amt.cgst === 0 && amt.sgst === 0) continue
    add(d, amt)
    d.rates.push({ rate: l.gst_rate, ...amt })
  }

  const b2b: Doc[] = [], b2cl: Doc[] = [], cdnr: Doc[] = [], cdnur: Doc[] = []
  const b2csMap = new Map<string, B2csRow>()
  const nil: Record<NilRow['type'], number> = { INTRB2B: 0, INTRB2C: 0, INTRAB2B: 0, INTRAB2C: 0 }
  const toB2cs = (d: Doc, sign: number) => {
    for (const r of d.rates) {
      const key = `${d.pos}|${r.rate}|${d.inter}`
      const row = b2csMap.get(key) ?? { pos: d.pos, rate: r.rate, inter: d.inter, ...zero() }
      add(row, r, sign)
      b2csMap.set(key, row)
    }
  }

  for (const d of docs.values()) {
    if (d.bill_type === 'bill_of_supply') {
      const type = (d.inter ? 'INTR' : 'INTRA') + (d.gstin ? 'B2B' : 'B2C')
      nil[type as NilRow['type']] += (d.kind === 'credit_note' ? -1 : 1) * d.value
      continue
    }
    if (!d.rates.length) continue
    if (d.kind === 'invoice') {
      if (d.gstin) b2b.push(d)
      else if (d.inter && d.value > B2CL_LIMIT) b2cl.push(d)
      else toB2cs(d, 1)
    } else if (d.gstin) cdnr.push(d)
    else if (d.inter && (d.ref_total ?? 0) > B2CL_LIMIT) cdnur.push(d)
    else toB2cs(d, -1)
  }

  // HSN / SAC summary (credit notes reduce)
  const hsnMap = new Map<string, HsnRow>()
  for (const r of hsnRaw) {
    const service = String(r.service)
    const sac = SAC_FOR_SERVICE[service] ?? SAC_FOR_SERVICE.misc
    const b2bFlag = !!r.registered
    const rate = n(r.gst_rate)
    const s = r.doc_kind === 'credit_note' ? -1 : 1
    const key = `${sac.sac}|${rate}|${b2bFlag}`
    const row = hsnMap.get(key) ?? { sac: sac.sac, desc: sac.desc, rate, b2b: b2bFlag, value: 0, ...zero() }
    row.value += s * n(r.total)
    add(row, { taxable: n(r.taxable), igst: n(r.igst), cgst: n(r.cgst), sgst: n(r.sgst) }, s)
    hsnMap.set(key, row)
  }
  const hsn = [...hsnMap.values()].filter((h) => h.taxable !== 0 || h.igst + h.cgst + h.sgst !== 0)

  const b2cs = [...b2csMap.values()].filter((r) => r.taxable !== 0 || r.igst + r.cgst + r.sgst !== 0)
  const sum = (rows: Amt[]) => rows.reduce((a, r) => (add(a, r), a), zero())
  const totals = {
    b2b: sum(b2b), b2cl: sum(b2cl), b2cs: sum(b2cs), cdnr: sum(cdnr), cdnur: sum(cdnur),
    exempt: Object.values(nil).reduce((a, v) => a + v, 0),
  }
  const net = zero()
  add(net, totals.b2b)
  add(net, totals.b2cl)
  add(net, totals.b2cs)
  add(net, totals.cdnr, -1)
  add(net, totals.cdnur, -1)

  return {
    b2b, b2cl, b2cs, cdnr, cdnur, hsn, totals, net,
    nil: (Object.entries(nil) as [NilRow['type'], number][]).filter(([, v]) => v !== 0).map(([type, exempt]) => ({ type, exempt })),
  }
}

export type Gstr1 = ReturnType<typeof buildGstr1>

// ---------------------------------------------------------------- JSON
const r2 = (paise: number) => Math.round(paise) / 100
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`
const itms = (d: Doc) =>
  d.rates.map((r) => ({
    num: Math.round(r.rate * 100) + 1,
    itm_det: { rt: r.rate, txval: r2(r.taxable), iamt: r2(r.igst), camt: r2(r.cgst), samt: r2(r.sgst), csamt: 0 },
  }))
const groupBy = <T,>(xs: T[], k: (x: T) => string) => xs.reduce<Record<string, T[]>>((g, x) => ((g[k(x)] ??= []).push(x), g), {})

/** GSTR-1 JSON in the GSTN offline-tool layout. `fp` is MMYYYY. */
export function gstr1Json(g: Gstr1, gstin: string, fp: string) {
  return {
    gstin,
    fp,
    b2b: Object.entries(groupBy(g.b2b, (d) => d.gstin!)).map(([ctin, ds]) => ({
      ctin,
      inv: ds.map((d) => ({ inum: d.no, idt: ddmmyyyy(d.date), val: r2(d.value), pos: d.pos, rchrg: 'N', inv_typ: 'R', itms: itms(d) })),
    })),
    b2cl: Object.entries(groupBy(g.b2cl, (d) => d.pos)).map(([pos, ds]) => ({
      pos,
      inv: ds.map((d) => ({ inum: d.no, idt: ddmmyyyy(d.date), val: r2(d.value), itms: itms(d) })),
    })),
    b2cs: g.b2cs.map((r) => ({
      sply_ty: r.inter ? 'INTER' : 'INTRA', pos: r.pos, typ: 'OE', rt: r.rate,
      txval: r2(r.taxable), iamt: r2(r.igst), camt: r2(r.cgst), samt: r2(r.sgst), csamt: 0,
    })),
    cdnr: Object.entries(groupBy(g.cdnr, (d) => d.gstin!)).map(([ctin, ds]) => ({
      ctin,
      nt: ds.map((d) => ({ ntty: 'C', nt_num: d.no, nt_dt: ddmmyyyy(d.date), val: r2(d.value), pos: d.pos, rchrg: 'N', inv_typ: 'R', itms: itms(d) })),
    })),
    cdnur: g.cdnur.map((d) => ({ typ: 'B2CL', ntty: 'C', nt_num: d.no, nt_dt: ddmmyyyy(d.date), val: r2(d.value), pos: d.pos, itms: itms(d) })),
    nil: { inv: g.nil.map((x) => ({ sply_ty: x.type, expt_amt: r2(x.exempt), nil_amt: 0, ngsup_amt: 0 })) },
    hsn: {
      hsn_b2b: g.hsn.filter((h) => h.b2b).map((h, i) => hsnJson(h, i)),
      hsn_b2c: g.hsn.filter((h) => !h.b2b).map((h, i) => hsnJson(h, i)),
    },
  }
}
const hsnJson = (h: HsnRow, i: number) => ({
  num: i + 1, hsn_sc: h.sac, desc: h.desc, uqc: 'NA', qty: 0, rt: h.rate,
  txval: r2(h.taxable), iamt: r2(h.igst), camt: r2(h.cgst), samt: r2(h.sgst), csamt: 0,
})

// ---------------------------------------------------------------- GSTR-3B
export function buildGstr3b(g: Gstr1, purchasesRaw: Record<string, unknown>[]) {
  const itc = purchasesRaw.reduce<Amt & { tds: number }>(
    (a, r) => ({ taxable: a.taxable + n(r.taxable), igst: a.igst + n(r.igst), cgst: a.cgst + n(r.cgst), sgst: a.sgst + n(r.sgst), tds: a.tds + n(r.tds) }),
    { ...zero(), tds: 0 },
  )
  const out = g.net
  // inter-state supplies to unregistered persons, by place of supply (table 3.2)
  const interB2c = new Map<string, { taxable: number; igst: number }>()
  for (const d of [...g.b2cl]) {
    const x = interB2c.get(d.pos) ?? { taxable: 0, igst: 0 }
    x.taxable += d.taxable
    x.igst += d.igst
    interB2c.set(d.pos, x)
  }
  for (const r of g.b2cs.filter((r) => r.inter)) {
    const x = interB2c.get(r.pos) ?? { taxable: 0, igst: 0 }
    x.taxable += r.taxable
    x.igst += r.igst
    interB2c.set(r.pos, x)
  }
  for (const d of g.cdnur) {
    const x = interB2c.get(d.pos) ?? { taxable: 0, igst: 0 }
    x.taxable -= d.taxable
    x.igst -= d.igst
    interB2c.set(d.pos, x)
  }
  return {
    outward: out,
    exempt: g.totals.exempt,
    itc,
    payable: { igst: out.igst - itc.igst, cgst: out.cgst - itc.cgst, sgst: out.sgst - itc.sgst },
    interB2c: [...interB2c.entries()].map(([pos, v]) => ({ pos, ...v })).filter((x) => x.taxable !== 0),
  }
}
