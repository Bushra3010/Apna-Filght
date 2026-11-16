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

// --- M3: packages, itinerary, quotation, proforma, hotel voucher
const lk = async (kind, name) => (await one(U1, `insert into lookups (org_id,kind,name) values ($1,$2,$3) returning id`, [org1, kind, name])).id
const deluxe = (await db.query(`select id from lookups where org_id=$1 and kind='package_class' and name='Deluxe'`, [org1])).rows[0].id
const cp = (await db.query(`select id from lookups where org_id=$1 and kind='meal_plan' and name like 'CP%'`, [org1])).rows[0].id
const shimla = (await db.query(`select id from cities where name='Shimla'`)).rows[0].id
const route = (await one(U1, `insert into routes (org_id,name) values ($1,'Delhi – Shimla – Manali – Delhi') returning id`, [org1])).id
const title = await lk('package_title', 'Himachal Delight')
const hotel = (await one(U1, `insert into hotels (org_id,name,city_id) values ($1,'Snow View',$2) returning id`, [org1, shimla])).id
const rate = (await one(U1, `insert into hotel_rates (org_id,hotel_id,package_class_id,meal_plan_id,rate_type,sell_rate,cost_rate,valid_from,valid_to)
  values ($1,$2,$3,$4,'per_room_night',450000,380000,'2026-10-01','2027-03-31') returning id`, [org1, hotel, deluxe, cp])).id
const actv = await lk('activity', 'Solang Valley')
const arate = (await one(U1, `insert into activity_rates (org_id,activity_id,city_id,sell_rate,cost_rate) values ($1,$2,$3,150000,100000) returning id`, [org1, actv, shimla])).id
const car = (await one(U1, `insert into vehicles (org_id,name,capacity,rate_per_km,night_charge) values ($1,'Innova',6,1800,30000) returning id`, [org1])).id

const itin = (await one(U1, `select public.save_itinerary($1,$2,$3) id`, [org1,
  { title: 'Himachal 4N', route_id: route, package_title_id: title, nights: 4 },
  [{ title: 'Arrive Shimla', city_id: shimla }, { title: 'Kufri excursion' }, { title: 'Drive to Manali' }]])).id
ok((await db.query(`select count(*)::int n from itinerary_days where itinerary_id=$1`, [itin])).rows[0].n === 3, 'itinerary saved with 3 days')
await rejects(as(U2, `select public.save_itinerary($1,$2,$3)`, [org2, { title: 'x', route_id: route }, []]), "another company's route rejected")

// 2 rooms × 4 nights @ 4,500 + 2 pax activity @ 1,500 + car 800 km @ 18 + 4 nights @ 300; 5% GST
const items = [
  { kind: 'hotel', day_no: 1, description: 'Snow View, Deluxe, CP', hotel_rate_id: rate, qty: 8, unit_cost: 380000, unit_price: 450000 },
  { kind: 'activity', day_no: 3, description: 'Solang Valley', activity_rate_id: arate, qty: 2, unit_cost: 100000, unit_price: 150000 },
  { kind: 'vehicle', description: 'Innova 800 km + 4 nights', vehicle_id: car, qty: 1, unit_cost: 1440000 + 120000, unit_price: 1800000 },
]
const qHeader = { quote_date: '2026-11-20', lead_id: lead, client_name: 'Ravi Kumar', party_ledger_id: cust, itinerary_id: itin,
  route_id: route, package_title_id: title, meal_plan_id: cp, start_date: '2026-12-20', nights: 4, adults: 2, gst_rate: 5 }
const q = (await one(U1, `select public.save_quotation($1,$2,$3) id`, [org1, qHeader, items])).id
const Q = (await db.query(`select quote_no, cost_total, subtotal, markup, tax_total, grand_total from quotations where id=$1`, [q])).rows[0]
ok(Q.quote_no === 'Q-0001' && Number(Q.subtotal) === 3600000 + 300000 + 1800000 && Number(Q.tax_total) === 285000 && Number(Q.grand_total) === 5985000,
  `quotation ${Q.quote_no}: ₹${Number(Q.subtotal) / 100} + 5% = ₹${Number(Q.grand_total) / 100}, margin ₹${Number(Q.markup) / 100}`)
await rejects(as(U1, `select public.save_quotation($1,$2,$3)`, [org1, qHeader, [{ ...items[0], qty: 0 }]]), 'zero-quantity item rejected')
await rejects(as(U2, `select public.save_quotation($1,$2,$3)`, [org2, { client_name: 'x', quote_date: '2026-11-20' }, [{ ...items[0] }]]), "another company's hotel rate rejected")
await one(U1, `select public.save_quotation($1,$2,$3) id`, [org1, { ...qHeader, id: q, gst_rate: 18 }, items.slice(0, 1)])
ok(Number((await db.query(`select grand_total from quotations where id=$1`, [q])).rows[0].grand_total) === 4248000, 'editing a quotation recomputes totals')

// proforma (not posted) -> invoice (posted)
const pf = (await one(U1, `select public.save_invoice($1,$2,$3,false) id`, [org1,
  { doc_kind: 'proforma', bill_type: 'tour', invoice_date: '2026-11-21', party_ledger_id: cust, place_of_supply_state_id: mh },
  [{ service: 'tour', description: 'Himachal Delight', basic: 3600000, taxable: 3600000, gst_rate: 5, cgst: 90000, sgst: 90000, net_sale: 3780000, details: { gst_on: 'full' } }]])).id
const PF = (await db.query(`select invoice_no, status from invoices where id=$1`, [pf])).rows[0]
const pfEntries = (await db.query(`select count(*)::int n from ledger_entries where source_id=$1`, [pf])).rows[0].n
ok(PF.invoice_no === 'PI-0001' && pfEntries === 0, `proforma ${PF.invoice_no} saved without touching the accounts`)
const conv = (await one(U1, `select public.convert_proforma($1,$2,'2026-11-22') id`, [org1, pf])).id
const CI = (await db.query(`select invoice_no, status, total from invoices where id=$1`, [conv])).rows[0]
ok(CI.status === 'posted' && Number(CI.total) === 3780000, `proforma converted to posted invoice ${CI.invoice_no}`)
await rejects(as(U1, `select public.convert_proforma($1,$2,'2026-11-22')`, [org1, pf]), 'a proforma converts only once')

// hotel voucher
const hv = (await one(U1, `select public.save_hotel_voucher($1,$2) id`, [org1, { voucher_date: '2026-11-22', party_ledger_id: cust, invoice_id: conv,
  hotel_id: hotel, property_name: 'Snow View', guest_name: 'RAVI KUMAR', adults: 2, check_in: '2026-12-20', check_out: '2026-12-24', rooms: 1, meal_plan: 'CP' }])).id
ok((await db.query(`select voucher_no from hotel_vouchers where id=$1`, [hv])).rows[0].voucher_no === 'HV-0001', 'hotel voucher HV-0001 saved')
await rejects(as(U1, `select public.save_hotel_voucher($1,$2)`, [org1, { voucher_date: '2026-11-22', property_name: 'X', guest_name: 'Y', check_in: '2026-12-24', check_out: '2026-12-20' }]), 'check-out before check-in rejected')

// --- M4: books, GST, outstanding, adjustment, year-end
const tbRows = (await as(U1, `select * from public.trial_balance($1,$2,'2026-04-01','2027-03-31')`, [org1, fy])).rows
const tbDr = tbRows.reduce((s, r) => s + Math.max(Number(r.closing), 0), 0)
const tbCr = tbRows.reduce((s, r) => s + Math.max(-Number(r.closing), 0), 0)
ok(tbRows.length > 10 && tbDr === tbCr && tbRows.every((r) => r.top_group_name && r.nature), `trial balance: ${tbRows.length} ledgers, Dr = Cr = ₹${tbDr / 100}`)
const profit = -tbRows.filter((r) => ['income', 'expense'].includes(r.nature)).reduce((s, r) => s + Number(r.closing), 0)
const bsDiff = tbRows.filter((r) => ['asset', 'liability', 'equity'].includes(r.nature)).reduce((s, r) => s + Number(r.closing), 0)
ok(bsDiff === profit, `balance sheet balances once profit ₹${profit / 100} is added to capital`)

const gs = (await as(U1, `select * from public.gst_sales_lines($1,'2026-11-01','2026-11-30')`, [org1])).rows
const docs = new Set(gs.map((r) => r.invoice_id))
const outTax = gs.reduce((s, r) => s + (r.doc_kind === 'credit_note' ? -1 : 1) * (Number(r.igst) + Number(r.cgst) + Number(r.sgst)), 0)
const outGl = (await db.query(`select sum(credit-debit)::bigint v from ledger_entries e join ledgers l on l.id=e.ledger_id
  where l.org_id=$1 and l.system_key in ('cgst_output','sgst_output','igst_output') and e.entry_date between '2026-11-01' and '2026-11-30'`, [org1])).rows[0].v
ok(docs.size === 5 && outTax === Number(outGl), `GST sales data: ${docs.size} documents (3 invoices, 2 credit notes; proformas excluded), output tax ₹${outTax / 100} matches the ledgers`)
ok(gs.some((r) => r.doc_kind === 'credit_note' && r.ref_no === 'INV-0002'), 'credit notes carry their original invoice for CDNR/CDNUR')
const hsn = (await as(U1, `select * from public.gst_hsn_lines($1,'2026-11-01','2026-11-30')`, [org1])).rows
ok(hsn.some((r) => r.service === 'flight') && hsn.some((r) => r.service === 'tour'), 'HSN/SAC summary groups by service')
const gp = (await as(U1, `select * from public.gst_purchase_lines($1,'2026-11-01','2026-11-30')`, [org1])).rows
const rent = gp.find((r) => r.supplier_name === 'Landlord')
ok(rent && Number(rent.cgst) === 180000 && Number(rent.tds) === 200000, 'purchase GST data includes the rent bill with ITC and TDS')

const outs = (await as(U1, `select * from public.party_outstanding($1,$2,'2026-11-30','customer')`, [org1, fy])).rows
const ravi = outs.find((r) => r.ledger_name === 'Ravi Kumar')
const raviGl = (await as(U1, `select balance from public.ledger_statement($1,$2,$3,'2026-04-01','2026-11-30')`, [org1, fy, cust])).rows
ok(ravi && Number(ravi.balance) === Number(raviGl[raviGl.length - 1].balance) && Number(ravi.open_bills) >= 1, `client outstanding ₹${Number(ravi?.balance) / 100} with ${ravi?.open_bills} open bill(s)`)

const rcpt = (await one(U1, `select public.save_receipt($1,$2) id`, [org1, { party_ledger_id: cust, cash_bank_ledger_id: bank, amount: 50000, voucher_date: '2026-11-28', mode: 'upi' }])).id
ok((await as(U1, `select unadjusted from v_unadjusted_vouchers where id=$1`, [rcpt])).rows[0]?.unadjusted == 50000, 'receipt on account shows as unadjusted')
await rejects(as(U1, `select public.allocate_voucher($1,$2,$3)`, [org1, rcpt, [{ invoice_id: inv2, amount: 60000 }]]), 'adjusting more than the receipt rejected')
await one(U1, `select public.allocate_voucher($1,$2,$3)`, [org1, rcpt, [{ invoice_id: inv2, amount: 50000 }]])
ok(Number((await one(U1, `select balance from v_invoice_balance where id=$1`, [inv2])).balance) === 94400 - 50000, 'later adjustment reduces the invoice balance')

const fy2 = (await one(U1, `select public.create_next_year($1) id`, [org1])).id
const FY2 = (await db.query(`select label, starts_on::text s from financial_years where id=$1`, [fy2])).rows[0]
const series = (await db.query(`select count(*)::int n from doc_series where fy_id=$1 and prefix='INV-'`, [fy2])).rows[0].n
ok(FY2.label === '2027-28' && FY2.s === '2027-04-01' && series === 1, `next year ${FY2.label} created with number series`)
await rejects(as(U2, `select public.carry_forward($1,$2)`, [org1, fy]), 'another company cannot carry forward')
const cf = (await one(U1, `select public.carry_forward($1,$2) r`, [org1, fy])).r
const ob = (await db.query(`select sum(amount)::bigint s, count(*)::int n from opening_balances where fy_id=$1`, [fy2])).rows[0]
ok(Number(ob.s) === 0 && ob.n === cf.ledgers && cf.profit === profit, `carried forward ${ob.n} balances; profit ₹${cf.profit / 100} moved to capital; opening balances net to zero`)
await one(U1, `select public.close_year($1,$2)`, [org1, fy])
await rejects(as(U1, `select public.save_receipt($1,$2)`, [org1, { party_ledger_id: cust, cash_bank_ledger_id: bank, amount: 100, voucher_date: '2026-12-01' }]), 'posting into a closed year rejected')
await rejects(as(U1, `insert into opening_balances (org_id, fy_id, ledger_id, amount) values ($1,$2,$3,100)`, [org1, fy, bank]), 'opening balances of a closed year are locked')
await one(U1, `select public.reopen_year($1,$2)`, [org1, fy])
ok(!(await db.query(`select is_closed from financial_years where id=$1`, [fy])).rows[0].is_closed, 'owner can reopen a year')

// --- M5: team security, invites, hierarchy, transfer, groups, alerts, CRM dashboard
const U3 = '33333333-3333-3333-3333-333333333333'
await db.exec(`insert into auth.users values ('${U3}','staff@example.com')`)
const salesRole = (await db.query(`select id from roles where org_id=$1 and name='Sales'`, [org1])).rows[0].id
const ownerRole = (await db.query(`select id from roles where org_id=$1 and is_owner`, [org1])).rows[0].id
await rejects(as(U3, `select public.invite_member($1,'x@example.com',$2)`, [org1, salesRole]), 'a non-member cannot invite')
const wrongTok = (await one(U1, `select public.invite_member($1,'someone@example.com',$2) t`, [org1, salesRole])).t
await rejects(as(U3, `select public.accept_invite($1)`, [wrongTok]), 'an invite cannot be used by a different email')
const tok = (await one(U1, `select public.invite_member($1,'Staff@Example.com',$2) t`, [org1, salesRole])).t
const info = await one(U3, `select * from public.invite_info($1)`, [tok])
ok(info.org_name === 'Apna Flight' && info.role_name === 'Sales' && info.email_matches, 'invite link shows company and role to the invited person')
ok((await db.query(`select count(*)::int n from org_invites where token_hash = $1`, [tok])).rows[0].n === 0, 'only a hash of the invite token is stored')
ok((await one(U3, `select public.accept_invite($1) o`, [tok])).o === org1, 'invited staff joins the company')
await rejects(as(U3, `select public.accept_invite($1)`, [tok]), 'an invite works only once')
const m3 = (await db.query(`select id from org_members where org_id=$1 and user_id=$2`, [org1, U3])).rows[0].id
const m1 = (await db.query(`select id from org_members where org_id=$1 and user_id=$2`, [org1, U1])).rows[0].id

await as(U3, `update org_members set role_id=$1 where id=$2`, [ownerRole, m3])
ok((await db.query(`select role_id from org_members where id=$1`, [m3])).rows[0].role_id === salesRole, 'staff cannot make themselves owner by editing the table')
await as(U3, `update roles set permissions='{"invoice":["post"]}' where id=$1`, [salesRole])
ok(!JSON.stringify((await db.query(`select permissions from roles where id=$1`, [salesRole])).rows[0].permissions).includes('post'), 'staff cannot edit role permissions directly')
await as(U3, `update financial_years set is_closed = true where id=$1`, [fy])
ok(!(await db.query(`select is_closed from financial_years where id=$1`, [fy])).rows[0].is_closed, 'staff cannot close or reopen years directly')
await rejects(as(U3, `select public.update_member($1,$2,$3)`, [org1, m3, { role_id: ownerRole }]), 'staff cannot change roles through the function either')
await rejects(as(U3, `select public.save_invoice($1,$2,$3)`, [org1, { bill_type: 'domestic', invoice_date: '2026-11-25', party_ledger_id: cust }, [line]]), 'a Sales role cannot raise invoices')
const staffLead = (await one(U3, `select public.save_lead($1,$2) id`, [org1, { guest_name: 'Walk In', phone: '9111111111', travel_date_open: true }])).id
ok(!!staffLead, 'a Sales role can create leads')

await one(U1, `select public.update_member($1,$2,$3)`, [org1, m3, { reports_to: m1, designation: 'Travel consultant' }])
await rejects(as(U1, `select public.update_member($1,$2,$3)`, [org1, m1, { reports_to: m3 }]), 'reporting loops are rejected')
await rejects(as(U1, `select public.update_member($1,$2,$3)`, [org1, m1, { role_id: salesRole }]), 'the last owner cannot be demoted')
const acct = (await one(U1, `select public.save_role($1,null,'Accountant',$2) id`, [org1, { invoice: ['view', 'create', 'edit', 'post'], voucher: ['view', 'create'] }])).id
ok(!!acct, 'owner can create a role')
await rejects(as(U1, `select public.save_role($1,$2,'Boss','{}')`, [org1, ownerRole]), 'the Owner role cannot be edited')

const moved = (await one(U1, `select public.transfer_leads($1,$2,$3,$4) n`, [org1, m1, m3, ['proposal', 'initial']])).n
ok(moved >= 1, `lead transfer moved ${moved} lead(s)`)
const crmSelf = (await one(U3, `select public.crm_dashboard($1,$2,'self') d`, [org1, fy])).d
const crmAll = (await one(U1, `select public.crm_dashboard($1,$2,'all') d`, [org1, fy])).d
ok(crmSelf.live >= 1 && crmAll.people.length === 2 && typeof crmAll.funnel.booked === 'number', `CRM dashboard: staff sees ${crmSelf.live} live lead(s); owner sees ${crmAll.people.length} people`)
const crmTeam = (await one(U1, `select public.crm_dashboard($1,$2,'team') d`, [org1, fy])).d
ok(crmTeam.people.length === 2, 'owner\'s team view includes people reporting to them')

// group purchase: 3 seats for ₹15,000; sell 2 at ₹6,000 each (fare only)
const grpBill = (await one(U1, `select public.save_group_purchase($1,$2) id`, [org1, { supplier_ledger_id: supp, bill_date: '2026-11-25', bill_type: 'domestic',
  sector: 'del-goa', pnr: 'grp1', travel_date: '2026-12-24', seats: 3, amount: 1500000, gst: 0 }])).id
const G = (await db.query(`select bill_no, total, status from purchase_bills where id=$1`, [grpBill])).rows[0]
ok(G.bill_no === 'GP-0001' && G.status === 'posted' && Number(G.total) === 1500000, `group purchase ${G.bill_no} posted`)
const seat = (n) => ({ service: 'flight', pax_name: n, basic: 600000, taxable: 0, gst_rate: 18, net_sale: 600000, group_purchase_id: grpBill })
const gi = (await one(U1, `select public.save_invoice($1,$2,$3) id`, [org1, { bill_type: 'domestic', invoice_date: '2026-11-26', party_ledger_id: cust, place_of_supply_state_id: mh }, [seat('A'), seat('B')]])).id
await rejects(as(U1, `select public.save_invoice($1,$2,$3)`, [org1, { bill_type: 'domestic', invoice_date: '2026-11-26', party_ledger_id: cust, place_of_supply_state_id: mh }, [seat('C'), seat('D')]]), 'selling more seats than the group has is rejected')
await one(U1, `select public.save_invoice($1,$2,$3) id`, [org1, { id: gi, bill_type: 'domestic', invoice_date: '2026-11-26', party_ledger_id: cust, place_of_supply_state_id: mh }, [seat('A'), seat('B')]])
ok(true, 'editing an invoice with group seats does not count them twice')
await rejects(as(U1, `select public.save_invoice($1,$2,$3)`, [org1, { bill_type: 'domestic', invoice_date: '2026-11-26', party_ledger_id: cust, place_of_supply_state_id: mh }, [{ ...seat('E'), supplier_ledger_id: supp, purchase_gross: 100, net_purchase: 100 }]]), 'a group seat cannot also carry a supplier cost')
const VG = await one(U1, `select sold, left_seats, revenue, profit from v_group_purchase where id=$1`, [grpBill])
ok(VG.sold === 2 && VG.left_seats === 1 && Number(VG.revenue) === 1200000 && Number(VG.profit) === 1200000 - 1500000, `group: 2 sold, 1 left, profit so far ₹${Number(VG.profit) / 100}`)
const gm = (await one(U1, `select sum(margin)::bigint m from v_invoice_line_margin where invoice_id=$1`, [gi])).m
ok(Number(gm) === 2 * (600000 - 500000), `seat margin uses the group's cost per seat (₹${Number(gm) / 100})`)

const al = (await as(U1, `select kind, doc_no from public.alerts($1,$2)`, [org1, fy])).rows
ok(al.some((a) => a.kind === 'pending_purchase' && a.doc_no === 'INV-0003') && al.some((a) => a.kind === 'loss_cn'), `alerts (tour invoice without cost, refund above recovery): ${[...new Set(al.map((a) => a.kind))].join(', ')}`)
const tb3 = (await one(U1, `select sum(closing)::bigint s from app.ledger_balances($1,$2,'2026-04-01','2027-03-31')`, [org1, fy])).s
ok(Number(tb3) === 0, 'trial balance still nets to zero after M5 transactions')

// --- M6: import formats, import history, WhatsApp templates
await as(U1, `insert into import_mappings (org_id, target, name, mapping) values ($1, 'billing', 'Portal export', '{"pax_name":"Pax Name"}')`, [org1])
ok((await as(U2, `select 1 from import_mappings where org_id=$1`, [org1])).rows.length === 0, "another company's saved import formats are hidden")
await rejects(as(U1, `insert into import_mappings (org_id, target, name) values ($1, 'billing', 'Portal export')`, [org1]), 'import format names are unique per target')
const ib = await one(U1, `insert into import_batches (org_id, target, format, file_name, row_count, status) values ($1, 'billing', 'Portal export', 'tickets.csv', 2, 'partially_generated') returning id`, [org1])
await as(U1, `insert into import_rows (org_id, batch_id, row_no, raw, invoice_id) values ($1, $2, 1, '{}', $3), ($1, $2, 2, '{}', null)`, [org1, ib.id, inv])
ok((await as(U2, `select 1 from import_rows where org_id=$1`, [org1])).rows.length === 0, 'import history needs no file path and is private to the company')
await as(U1, `insert into message_templates (org_id, doc_type, channel, body) values ($1, 'invoice', 'whatsapp', 'Hi {client}') on conflict (org_id, doc_type, channel) do update set body = excluded.body`, [org1])
await rejects(as(U2, `update message_templates set body='x' where org_id=$1 returning id`, [org1]).then((r) => { if (!r.rows.length) throw new Error('blocked') }), "another company's WhatsApp messages cannot be changed")

// --- guards
await rejects(as(U1, `insert into ledger_entries (org_id,fy_id,entry_date,ledger_id,debit,source_type,source_id,doc_no) values ($1,$2,'2026-11-17',$3,1,'voucher',gen_random_uuid(),'x')`, [org1, fy, bank]), 'direct GL write blocked')
ok((await as(U1, `delete from invoices where id=$1 returning id`, [inv])).rows.length === 0, 'posted invoice cannot be deleted')
await rejects(as(U2, `select public.save_lead($1,$2)`, [org1, { guest_name: 'x', phone: '1', travel_date_open: true }]), 'non-member cannot save leads')
await db.exec(`set role anon`)
await rejects(db.query(`select public.create_org('x','27','2026-04-01')`), 'anonymous users cannot call RPCs')
await db.exec(`reset role`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
