// Unit tests for the pure money / GST / GST-return helpers.
//   npm run test:unit
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'apna-unit-'))
execFileSync(path.join(root, 'node_modules/.bin/tsc'), [
  'lib/gst.ts', 'lib/gst-returns.ts', 'lib/statements.ts', 'lib/words.ts',
  '--outDir', out, '--module', 'es2022', '--target', 'es2022', '--skipLibCheck',
], { cwd: root, stdio: 'inherit' })
for (const f of fs.readdirSync(out)) fs.renameSync(path.join(out, f), path.join(out, f.replace(/\.js$/, '.mjs')))
const imp = (f) => import(path.join(out, f))
const { computeLine } = await imp('gst.mjs')
const { buildGstr1, gstr1Json, buildGstr3b } = await imp('gst-returns.mjs')
const { profitAndLoss, balanceSheet } = await imp('statements.mjs')
const { amountInWords } = await imp('words.mjs')

let bad = 0
const ok = (v, m) => { console.log(v ? 'PASS' : 'FAIL', m); if (!v) bad++ }

// --- GST on a line
const z = { basic: 0, xt: 0, service_fee: 0, other_charges: 0, discount: 0, gst_rate: 18, purchase_gross: 0, purchase_gst: 0, commission: 0, tds: 0 }
const fl = computeLine({ ...z, basic: 500000, xt: 80000, service_fee: 30000, gst_on: 'service' }, false)
ok(fl.taxable === 30000 && fl.cgst === 2700 && fl.sgst === 2700 && fl.net_sale === 615400, 'flight: GST on fee only, ₹6,154')
const ht = computeLine({ ...z, basic: 1000000, service_fee: 50000, gst_on: 'full' }, false)
ok(ht.taxable === 1050000 && ht.net_sale === 1239000, 'hotel: GST on full value, ₹12,390')
const tr = computeLine({ ...z, basic: 5000000, gst_on: 'full', gst_rate: 5 }, true)
ok(tr.igst === 250000 && tr.cgst === 0, 'tour inter-state: 5% IGST')
const odd = computeLine({ ...z, service_fee: 101, gst_on: 'service' }, false)
ok(odd.cgst + odd.sgst === Math.round(101 * 0.18), 'odd paise: CGST + SGST add up to the rounded tax')

// --- amount in words
ok(amountInWords(615400) === 'Rupees Six Thousand One Hundred Fifty Four Only', 'amount in words')
ok(amountInWords(1234567890).startsWith('Rupees One Crore Twenty Three Lakh'), 'amount in words: crore and lakh')

// --- GSTR-1 / 3B
const L = (o) => ({ invoice_id: o.id, doc_kind: o.kind ?? 'invoice', bill_type: o.bt ?? 'domestic', invoice_no: o.no, invoice_date: '2026-11-10', total: o.total, party_name: 'X', party_gstin: o.gstin ?? null, pos_code: o.pos ?? '27', is_interstate: !!o.inter, ref_no: o.ref ?? null, ref_date: null, ref_total: o.refTotal ?? null, gst_rate: o.rate ?? 18, taxable: o.tx ?? 0, igst: o.i ?? 0, cgst: o.c ?? 0, sgst: o.s ?? 0, exempt: o.ex ?? 0 })
const rows = [
  L({ id: 'a', no: 'INV-1', total: 615400, gstin: '27ABCDE1234F1Z5', tx: 30000, c: 2700, s: 2700 }),
  L({ id: 'b', no: 'INV-2', total: 15000000, inter: true, pos: '07', tx: 15000000, i: 750000, rate: 5 }),
  L({ id: 'c', no: 'INV-3', total: 615400, inter: true, pos: '07', tx: 30000, i: 5400 }),
  L({ id: 'd', no: 'INV-4', total: 615400, tx: 30000, c: 2700, s: 2700 }),
  L({ id: 'e', no: 'CN-1', kind: 'credit_note', total: 100000, tx: 10000, c: 900, s: 900 }),
  L({ id: 'f', no: 'CN-2', kind: 'credit_note', total: 5000000, inter: true, pos: '07', ref: 'INV-2', refTotal: 15000000, tx: 4000000, i: 200000, rate: 5 }),
  L({ id: 'g', no: 'CN-3', kind: 'credit_note', total: 50000, gstin: '27ABCDE1234F1Z5', tx: 5000, c: 450, s: 450 }),
  L({ id: 'h', no: 'BOS-1', bt: 'bill_of_supply', total: 200000, ex: 200000, rate: 0 }),
  L({ id: 'i', no: 'INV-5', total: 500000, tx: 0 }),
]
const g = buildGstr1(rows, [{ service: 'flight', registered: true, gst_rate: 18, doc_kind: 'invoice', total: 615400, taxable: 30000, igst: 0, cgst: 2700, sgst: 2700 }])
ok(g.b2b.length === 1 && g.b2b[0].no === 'INV-1', 'GSTR-1 B2B: registered client')
ok(g.b2cl.length === 1 && g.b2cl[0].no === 'INV-2', 'GSTR-1 B2CL: unregistered inter-state above ₹1 lakh')
ok(g.b2cs.length === 2 && g.b2cs.find((r) => r.pos === '27').taxable === 20000, 'GSTR-1 B2CS: summarised, small credit note netted')
ok(g.cdnr.length === 1 && g.cdnur.length === 1 && g.cdnur[0].no === 'CN-2', 'GSTR-1 CDNR / CDNUR')
ok(g.nil.length === 1 && g.nil[0].type === 'INTRAB2C' && g.nil[0].exempt === 200000, 'GSTR-1 NIL: bill of supply as exempt')
ok(!JSON.stringify(g).includes('INV-5'), 'fare-only invoice (no taxable value) not reported')
const j = gstr1Json(g, '27ABCDE1234F1Z5', '112026')
ok(j.b2b[0].inv[0].itms[0].num === 1801 && j.b2b[0].inv[0].itms[0].itm_det.camt === 27 && j.b2b[0].inv[0].idt === '10-11-2026', 'GSTR-1 JSON: B2B item in rupees, dd-mm-yyyy')
ok(j.hsn.hsn_b2b[0].hsn_sc === '998551', 'GSTR-1 JSON: SAC summary')
const b = buildGstr3b(g, [{ taxable: 2000000, igst: 0, cgst: 180000, sgst: 180000, tds: 200000 }])
ok(b.payable.cgst === g.net.cgst - 180000, 'GSTR-3B: output tax less ITC')
ok(b.interB2c.length === 1 && b.interB2c[0].taxable === 15000000 + 30000 - 4000000, 'GSTR-3B 3.2: inter-state B2C by state')

// --- statements
const R = (name, key, nature, closing, debit = 0, credit = 0, opening = 0) => ({ ledger_id: name, ledger_name: name, ledger_kind: 'x', group_id: key, group_name: key, top_group_id: key, top_group_name: key, top_group_key: key, nature, top_sort: 1, opening, debit, credit, closing })
const tb = [
  R('Sales', 'sales', 'income', -1000, 0, 1000), R('Purchase', 'purchase', 'expense', 700, 700, 0),
  R('Rent', 'indirect_expense', 'expense', 100, 100, 0), R('Bank', 'current_assets', 'asset', 500, 500, 0, 300),
  R('Capital', 'capital', 'equity', -300, 0, 0, -300), R('Supplier', 'current_liabilities', 'liability', 0, 0, 0),
]
const pl = profitAndLoss(tb)
ok(pl.gross === 300 && pl.net === 200, 'P&L: gross profit 300, net profit 200')
const bs = balanceSheet(tb)
ok(bs.diff === 0 && bs.totalAssets === 500 && bs.totalLiab === 500, 'balance sheet balances with profit in capital')

fs.rmSync(out, { recursive: true, force: true })
console.log(bad ? `\n${bad} failed` : '\nall unit tests passed')
process.exit(bad ? 1 : 0)
