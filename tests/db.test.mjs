// Runs every Supabase migration on an in-memory Postgres (PGlite) and checks
// tenancy, numbering, posting and the RPCs the app calls.
//   npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import fs from 'node:fs'
import path from 'node:path'

const dir = path.join(import.meta.dirname, '..', 'supabase', 'migrations')
const db = new PGlite({ extensions: { btree_gist } })
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m) } else { fail++; console.log('FAIL', m) } }
const rejects = async (p, m) => { try { await p; ok(false, m + ' (was accepted)') } catch (e) { ok(true, m + ' -> ' + e.message.split('\n')[0]) } }

// Supabase stand-ins
await db.exec(`
  create role authenticated nologin; create role anon nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant select on auth.users to authenticated;
`)
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  // gen_random_uuid is built in; PGlite ships no pgcrypto
  await db.exec(fs.readFileSync(path.join(dir, f), 'utf8').replace('create extension if not exists pgcrypto;', ''))
  ok(true, `migration ${f} applies`)
}
await db.exec(`grant usage on schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on all sequences in schema public to authenticated;`)

const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${U1}','a@example.com'),('${U2}','b@example.com')`)
const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const one = async (uid, sql, params) => (await as(uid, sql, params)).rows[0]

// --- reference data
const nStates = (await db.query(`select count(*)::int n from states where gst_code is not null`)).rows[0].n
ok(nStates === 37, `GST state codes seeded (${nStates})`)

// --- companies
const org1 = (await one(U1, `select public.create_org('Apna Flight','27','2026-04-01') id`)).id   // Maharashtra
const org2 = (await one(U2, `select public.create_org('Other Agency','07','2026-04-01') id`)).id  // Delhi
ok(org1 && org2, 'create_org via RPC for two users')
const fy = (await db.query(`select id from financial_years where org_id=$1`, [org1])).rows[0].id
const nLedgers = (await db.query(`select count(*)::int n from ledgers where org_id=$1`, [org1])).rows[0].n
ok(nLedgers === 29, `system ledgers seeded (${nLedgers})`)
ok((await one(U2, `select count(*)::int n from ledgers where org_id=$1`, [org1])).n === 0, 'user 2 cannot read org 1')
await rejects(as(U2, `insert into ledgers (org_id,group_id,name,kind) select $1, id, 'x','customer' from account_groups limit 1`, [org1]), 'cross-org insert blocked')
ok((await as(U1, `select 1 from airlines where org_id is null`)).rows.length === 30, 'global airlines readable')

// --- masters
const grp = async k => (await db.query(`select id from account_groups where org_id=$1 and system_key=$2`, [org1, k])).rows[0].id
const mh = (await db.query(`select id from states where gst_code='27'`)).rows[0].id
const dl = (await db.query(`select id from states where gst_code='07'`)).rows[0].id
const cust = (await one(U1, `insert into ledgers (org_id,group_id,name,kind,state_id) values ($1,$2,'Ravi Kumar','customer',$3) returning id`, [org1, await grp('sundry_debtors'), mh])).id
const supp = (await one(U1, `insert into ledgers (org_id,group_id,name,kind) values ($1,$2,'Air Consolidator','supplier') returning id`, [org1, await grp('sundry_creditors')])).id
const bank = (await one(U1, `insert into ledgers (org_id,group_id,name,kind) values ($1,$2,'HDFC Bank','bank') returning id`, [org1, await grp('bank_accounts')])).id
const foreign = (await one(U2, `insert into ledgers (org_id,group_id,name,kind) select $1, id, 'Theirs','customer' from account_groups where org_id=$1 and system_key='sundry_debtors' returning id`, [org2])).id

// --- leads
const lead = (await one(U1, `select public.save_lead($1, $2) id`, [org1, {
  guest_name: 'Ravi Kumar', phone: '9876543210', travel_date: '2026-12-20', services: ['flight', 'hotel'],
  adults: 2, source: 'whatsapp', budget: 5000000, followup: { action: 'call', due_at: '2026-11-18T03:30:00Z' } }])).id
const L = (await db.query(`select lead_no, next_followup_at, assigned_to from leads where id=$1`, [lead])).rows[0]
ok(L.lead_no === 'L-0001' && L.next_followup_at && L.assigned_to, `save_lead numbers ${L.lead_no}, sets follow-up and assignee`)
await one(U1, `select public.save_lead($1, $2) id`, [org1, { id: lead, guest_name: 'Ravi K', phone: '9876543210', travel_date_open: true, status: 'proposal' }])
ok((await db.query(`select status, guest_name from leads where id=$1`, [lead])).rows[0].status === 'proposal', 'save_lead updates')

// --- invoices
// intra-state (MH -> MH): fare 5000 + XT 800 + fee 300 + 9% CGST + 9% SGST on fee
const line = {
  service: 'flight', pax_name: 'RAVI KUMAR', pnr: 'ABC123', sector: 'DEL-BOM', travel_date: '2026-12-20',
  basic: 500000, xt: 80000, service_fee: 30000, taxable: 30000, gst_rate: 18, cgst: 2700, sgst: 2700, net_sale: 615400,
  supplier_ledger_id: supp, purchase_gross: 580000, commission: 5000, tds: 250, net_purchase: 575250 }
const inv = (await one(U1, `select public.save_invoice($1,$2,$3) id`, [org1,
  { bill_type: 'domestic', invoice_date: '2026-11-16', party_ledger_id: cust, place_of_supply_state_id: mh, lead_id: lead }, [line]])).id
const I = (await db.query(`select invoice_no,total,status,is_interstate from invoices where id=$1`, [inv])).rows[0]
ok(I.invoice_no === 'INV-0001' && Number(I.total) === 615400 && I.status === 'posted' && !I.is_interstate,
  `save_invoice ${I.invoice_no} posted, total ₹${Number(I.total) / 100}`)
const gl = (await db.query(`select sum(debit)::bigint d, sum(credit)::bigint c from ledger_entries where source_id=$1`, [inv])).rows[0]
ok(gl.d === gl.c, `invoice GL balanced (${gl.d} = ${gl.c})`)

await rejects(as(U1, `select public.save_invoice($1,$2,$3)`, [org1,
  { bill_type: 'domestic', invoice_date: '2026-11-16', party_ledger_id: cust, place_of_supply_state_id: dl }, [line]]),
  'CGST+SGST rejected for inter-state supply')
const igLine = { ...line, cgst: 0, sgst: 0, igst: 5400 }
const inv2 = (await one(U1, `select public.save_invoice($1,$2,$3) id`, [org1,
  { bill_type: 'domestic', invoice_date: '2026-11-17', party_ledger_id: cust, place_of_supply_state_id: dl }, [igLine]])).id
ok((await db.query(`select is_interstate from invoices where id=$1`, [inv2])).rows[0].is_interstate, 'inter-state invoice with IGST accepted')
await rejects(as(U1, `select public.save_invoice($1,$2,$3)`, [org1,
  { bill_type: 'domestic', invoice_date: '2026-11-16', party_ledger_id: foreign, place_of_supply_state_id: mh }, [line]]),
  "another company's ledger rejected")
await rejects(as(U1, `select public.save_invoice($1,$2,$3)`, [org1,
  { bill_type: 'domestic', invoice_date: '2026-11-16', party_ledger_id: cust }, [{ ...line, net_sale: 999 }]]),
  'bad line arithmetic rejected')
await rejects(as(U1, `select public.save_invoice($1,$2,$3)`, [org1,
  { bill_type: 'domestic', invoice_date: '2027-06-01', party_ledger_id: cust }, [line]]),
  'date outside any open year rejected')
const after = (await db.query(`select count(*)::int n from invoices where org_id=$1`, [org1])).rows[0].n
ok(after === 2, `failed saves leave nothing behind (${after} invoices)`)

// edit re-posts
await one(U1, `select public.save_invoice($1,$2,$3) id`, [org1,
  { id: inv, bill_type: 'domestic', invoice_date: '2026-11-16', party_ledger_id: cust, place_of_supply_state_id: mh },
  [{ ...line, service_fee: 40000, taxable: 40000, cgst: 3600, sgst: 3600, net_sale: 627200 }]])
const I2 = (await db.query(`select total from invoices where id=$1`, [inv])).rows[0]
const gl2 = (await db.query(`select sum(debit)::bigint d, sum(credit)::bigint c from ledger_entries where source_id=$1`, [inv])).rows[0]
ok(Number(I2.total) === 627200 && gl2.d === gl2.c, 'editing a posted invoice re-posts it balanced')

// --- receipts
await rejects(as(U1, `select public.save_receipt($1,$2)`, [org1, { party_ledger_id: cust, cash_bank_ledger_id: bank,
  amount: 100000, voucher_date: '2026-11-18', allocations: [{ invoice_id: inv, amount: 200000 }] }]), 'allocation above receipt rejected')
const rv = (await one(U1, `select public.save_receipt($1,$2) id`, [org1, { party_ledger_id: cust, cash_bank_ledger_id: bank,
  amount: 627200, voucher_date: '2026-11-18', mode: 'upi', allocations: [{ invoice_id: inv, amount: 627200 }] }])).id
ok((await db.query(`select voucher_no from vouchers where id=$1`, [rv])).rows[0].voucher_no === 'RV-0001', 'save_receipt numbers RV-0001')
const vb = (await one(U1, `select pay_status from v_invoice_balance where id=$1`, [inv])).pay_status
ok(vb === 'paid', `invoice now ${vb}`)
await rejects(as(U1, `select public.save_receipt($1,$2)`, [org1, { party_ledger_id: cust, cash_bank_ledger_id: supp,
  amount: 100, voucher_date: '2026-11-18' }]), 'receipt into a non cash/bank ledger rejected')

// --- reports
const st = (await as(U1, `select * from public.ledger_statement($1,$2,$3,'2026-04-01','2027-03-31')`, [org1, fy, cust])).rows
const last = st[st.length - 1]
ok(st[0].doc_no === 'Opening balance' && st.length === 4, `ledger statement has opening + ${st.length - 1} rows`)
ok(Number(last.balance) === 615400, `customer still owes inv2 only: ₹${Number(last.balance) / 100}`)
const ds = (await one(U1, `select public.dashboard_summary($1,$2) s`, [org1, fy])).s
ok(Number(ds.sales) === 627200 + 615400 && Number(ds.margin) === 80000 && Number(ds.receivable) === 615400 && Number(ds.open_leads) === 1,
  `dashboard: sales ₹${Number(ds.sales) / 100}, receivable ₹${Number(ds.receivable) / 100}, margin ₹${Number(ds.margin) / 100}`)
const tb = (await one(U1, `select sum(closing)::bigint s from app.ledger_balances($1,$2,'2026-04-01','2027-03-31')`, [org1, fy])).s
ok(Number(tb) === 0, 'trial balance nets to zero')

// --- M2: credit note with cancellation charges on the unpaid inter-state invoice (inv2, ₹6,154)
// refund fare 5000 + XT 800 (fee not refunded); charges ₹500 + 18% IGST = ₹590; client gets 5800 − 590 = ₹5,210
// supplier refunds ₹5,300 of the ₹5,800 purchase; commission 50 and TDS 2.50 reversed
const cnLines = [
  { service: 'flight', pax_name: 'RAVI KUMAR', basic: 500000, xt: 80000, taxable: 0, gst_rate: 18, net_sale: 580000,
    supplier_ledger_id: supp, purchase_gross: 530000, commission: 5000, tds: 250, net_purchase: 525250 },
  { service: 'cancellation_charge', description: 'Cancellation charges', service_fee: -50000, taxable: -50000, gst_rate: 18,
    igst: -9000, net_sale: -59000 },
]
const cnHeader = { doc_kind: 'credit_note', bill_type: 'domestic', invoice_date: '2026-11-20', party_ledger_id: cust,
  place_of_supply_state_id: dl, ref_invoice_id: inv2 }
await rejects(as(U1, `select public.save_invoice($1,$2,$3)`, [org1, { ...cnHeader, ref_invoice_id: null }, cnLines]), 'credit note without invoice rejected')
await rejects(as(U1, `select public.save_invoice($1,$2,$3)`, [org1, { ...cnHeader, doc_kind: 'invoice' }, cnLines]), 'cancellation charges on an invoice rejected')
const cn = (await one(U1, `select public.save_invoice($1,$2,$3) id`, [org1, cnHeader, cnLines])).id
const CN = (await db.query(`select invoice_no, total, cancel_charges from invoices where id=$1`, [cn])).rows[0]
ok(CN.invoice_no === 'CN-0001' && Number(CN.total) === 521000 && Number(CN.cancel_charges) === 50000,
  `credit note ${CN.invoice_no}: refund ₹${Number(CN.total) / 100}, charges ₹${Number(CN.cancel_charges) / 100}`)
const cnGl = (await db.query(`select sum(debit)::bigint d, sum(credit)::bigint c from ledger_entries where source_id=$1`, [cn])).rows[0]
ok(cnGl.d === cnGl.c, `credit note GL balanced (${cnGl.d})`)
const cancelInc = (await db.query(`select sum(credit-debit)::bigint v from ledger_entries e join ledgers l on l.id=e.ledger_id where l.org_id=$1 and l.system_key='cancellation_income'`, [org1])).rows[0].v
ok(Number(cancelInc) === 50000, 'cancellation charges credited to their own income ledger')
const b2 = (await one(U1, `select balance, pay_status from v_invoice_balance where id=$1`, [inv2]))
ok(Number(b2.balance) === 615400 - 521000 && b2.pay_status === 'partial', `invoice balance after credit note ₹${Number(b2.balance) / 100} (${b2.pay_status})`)

// paid invoice + credit note => refund due => pay refund
const cn2 = (await one(U1, `select public.save_invoice($1,$2,$3) id`, [org1,
  { ...cnHeader, place_of_supply_state_id: mh, ref_invoice_id: inv, invoice_date: '2026-11-21' },
  [{ service: 'flight', pax_name: 'RAVI KUMAR', basic: 100000, taxable: 0, gst_rate: 18, net_sale: 100000 }]])).id
ok(!!cn2, 'second credit note against the paid invoice saved')
const b1 = await one(U1, `select balance, pay_status from v_invoice_balance where id=$1`, [inv])
ok(Number(b1.balance) === -100000 && b1.pay_status === 'refund_due', `paid invoice now shows refund due ₹${-Number(b1.balance) / 100}`)
await rejects(as(U1, `select public.save_voucher($1,$2)`, [org1, { kind: 'payment', voucher_date: '2026-11-22', party_ledger_id: cust,
  cash_bank_ledger_id: bank, amount: 200000, allocations: [{ invoice_id: inv, amount: 200000 }] }]), 'refund above amount due rejected')
const pv = (await one(U1, `select public.save_voucher($1,$2) id`, [org1, { kind: 'payment', voucher_date: '2026-11-22', party_ledger_id: cust,
  cash_bank_ledger_id: bank, amount: 100000, mode: 'upi', allocations: [{ invoice_id: inv, amount: 100000 }] }])).id
const b1b = await one(U1, `select balance, pay_status from v_invoice_balance where id=$1`, [inv])
ok(Number(b1b.balance) === 0 && b1b.pay_status === 'paid', `refund ${(await db.query('select voucher_no from vouchers where id=$1', [pv])).rows[0].voucher_no} settles the invoice`)

// general purchase: office rent ₹20,000 + 18% GST (intra), TDS 10% on rent ₹2,000
const rentLedger = (await one(U1, `insert into ledgers (org_id,group_id,name,kind) values ($1,$2,'Office Rent','expense') returning id`, [org1, await grp('indirect_expense')])).id
const landlord = (await one(U1, `insert into ledgers (org_id,group_id,name,kind,state_id) values ($1,$2,'Landlord','supplier',$3) returning id`, [org1, await grp('sundry_creditors'), mh])).id
await rejects(as(U1, `select public.save_purchase_bill($1,$2,$3)`, [org1, { supplier_ledger_id: landlord, bill_date: '2026-11-05' },
  [{ ledger_id: bank, taxable: 100, amount: 100 }]]), 'purchase line on a bank account rejected')
const pb = (await one(U1, `select public.save_purchase_bill($1,$2,$3) id`, [org1,
  { supplier_ledger_id: landlord, bill_date: '2026-11-05', supplier_bill_no: 'R-11', place_of_supply_state_id: mh, tds: 200000 },
  [{ ledger_id: rentLedger, description: 'Rent Nov', taxable: 2000000, gst_rate: 18, cgst: 180000, sgst: 180000, amount: 2360000 }]])).id
const PB = (await db.query(`select bill_no,total,status from purchase_bills where id=$1`, [pb])).rows[0]
ok(PB.bill_no === 'PB-0001' && Number(PB.total) === 2160000 && PB.status === 'posted', `purchase ${PB.bill_no} payable ₹${Number(PB.total) / 100}`)
await one(U1, `select public.save_voucher($1,$2) id`, [org1, { kind: 'payment', voucher_date: '2026-11-25', party_ledger_id: landlord,
  cash_bank_ledger_id: bank, amount: 2160000, mode: 'bank_transfer', allocations: [{ purchase_bill_id: pb, amount: 2160000 }] }])
ok(Number((await one(U1, `select balance from v_purchase_balance where id=$1`, [pb])).balance) === 0, 'supplier payment settles the purchase bill')

// contra + journal
const cash = (await db.query(`select app.sys_ledger($1,'cash') id`, [org1])).rows[0].id
await rejects(as(U1, `select public.save_voucher($1,$2)`, [org1, { kind: 'contra', voucher_date: '2026-11-26', party_ledger_id: cust, cash_bank_ledger_id: bank, amount: 100 }]), 'contra to a client rejected')
await one(U1, `select public.save_voucher($1,$2) id`, [org1, { kind: 'contra', voucher_date: '2026-11-26', party_ledger_id: cash, cash_bank_ledger_id: bank, amount: 1000000 }])
await rejects(as(U1, `select public.save_voucher($1,$2)`, [org1, { kind: 'journal', voucher_date: '2026-11-27', lines: [{ ledger_id: cash, debit: 100 }, { ledger_id: rentLedger, credit: 90 }] }]), 'unbalanced journal rejected')
const jv = (await one(U1, `select public.save_voucher($1,$2) id`, [org1, { kind: 'journal', voucher_date: '2026-11-27', narration: 'Rent paid in cash',
  lines: [{ ledger_id: rentLedger, debit: 50000, credit: 0 }, { ledger_id: cash, debit: 0, credit: 50000 }] }])).id
ok((await db.query(`select voucher_no from vouchers where id=$1`, [jv])).rows[0].voucher_no === 'JV-0001', 'journal JV-0001 posted')

// reports
const dbk = (await as(U1, `select * from public.day_book($1,$2,'2026-11-01','2026-11-30')`, [org1, fy])).rows
const dbDr = dbk.reduce((s, r) => s + Number(r.debit), 0), dbCr = dbk.reduce((s, r) => s + Number(r.credit), 0)
ok(dbk.length > 20 && dbDr === dbCr, `day book: ${dbk.length} entries, Dr = Cr = ₹${dbDr / 100}`)
const ms = (await as(U1, `select * from public.monthly_sales($1,$2)`, [org1, fy])).rows
const nov = ms.find((m) => String(m.month).includes('2026-11') || new Date(m.month).getMonth() === 10)
ok(ms.length === 12 && Number(nov.sales) === 627200 + 615400 - 521000 - 100000, `monthly sales: 12 months, Nov ₹${Number(nov.sales) / 100}`)
const ag = (await as(U1, `select * from public.receivable_ageing($1)`, [org1])).rows
ok(ag.length === 6 && ag.reduce((s, r) => s + Number(r.amount), 0) === 615400 - 521000, 'receivable ageing buckets add up to the open balance')
const tb2 = (await one(U1, `select sum(closing)::bigint s from app.ledger_balances($1,$2,'2026-04-01','2027-03-31')`, [org1, fy])).s
ok(Number(tb2) === 0, 'trial balance still nets to zero after M2 transactions')

// --- guards
await rejects(as(U1, `insert into ledger_entries (org_id,fy_id,entry_date,ledger_id,debit,source_type,source_id,doc_no) values ($1,$2,'2026-11-17',$3,1,'voucher',gen_random_uuid(),'x')`, [org1, fy, bank]), 'direct GL write blocked')
ok((await as(U1, `delete from invoices where id=$1 returning id`, [inv])).rows.length === 0, 'posted invoice cannot be deleted')
await rejects(as(U2, `select public.save_lead($1,$2)`, [org1, { guest_name: 'x', phone: '1', travel_date_open: true }]), 'non-member cannot save leads')
await db.exec(`set role anon`)
await rejects(db.query(`select public.create_org('x','27','2026-04-01')`), 'anonymous users cannot call RPCs')
await db.exec(`reset role`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
