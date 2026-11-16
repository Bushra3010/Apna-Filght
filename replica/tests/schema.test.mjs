import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import fs from 'node:fs'

const db = new PGlite({ extensions: { btree_gist } })
const schema = fs.readFileSync(process.argv[2], 'utf8').replace('create extension if not exists pgcrypto;', '')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m) } else { fail++; console.log('FAIL', m) } }
const throws = async (sql, m) => { try { await db.exec(sql); ok(false, m + ' (did not throw)') } catch (e) { ok(true, m + ' -> ' + e.message.split('\n')[0]) } }

// Supabase stand-ins
await db.exec(`
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant select on auth.users to authenticated;
`)
await db.exec(schema)
ok(true, 'schema loads')
await db.exec(`grant usage on schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage on all sequences in schema public to authenticated;`)

// seed geography
await db.exec(`insert into countries values ('IN','India','+91');
  insert into states (country_code,name,gst_code) values ('IN','Maharashtra','27'),('IN','Delhi','07');`)
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${U1}','a@example.com'),('${U2}','b@example.com')`)

const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}

const org1 = (await as(U1, `select app.create_org('Apna Flight','27','2026-04-01') id`)).rows[0].id
const org2 = (await as(U2, `select app.create_org('Other Agency','07','2026-04-01') id`)).rows[0].id
ok(org1 && org2, 'create_org for two users')
const nLedgers = (await db.query(`select count(*)::int n from ledgers where org_id=$1`, [org1])).rows[0].n
ok(nLedgers === 29, `system ledgers seeded (${nLedgers})`)

// isolation
const seen = (await as(U2, `select count(*)::int n from ledgers where org_id=$1`, [org1])).rows[0].n
ok(seen === 0, 'user 2 cannot read org 1 ledgers')
try { await as(U2, `insert into leads (org_id,lead_no,guest_name,phone,travel_date_open) values ($1,'X','x','1',true)`, [org1]); ok(false, 'cross-org insert blocked') }
catch (e) { ok(true, 'cross-org insert blocked') }

const fy = (await db.query(`select id from financial_years where org_id=$1`, [org1])).rows[0].id
const n1 = (await as(U1, `select app.next_doc_no($1,$2,'invoice') n`, [org1, fy])).rows[0].n
const n2 = (await as(U1, `select app.next_doc_no($1,$2,'invoice') n`, [org1, fy])).rows[0].n
ok(n1 === 'INV-0001' && n2 === 'INV-0002', `numbering ${n1}, ${n2}`)

// lead + followup trigger
const lead = (await as(U1, `insert into leads (org_id,lead_no,guest_name,phone,travel_date,services)
  values ($1,'L-0001','Ravi','9999999999','2026-12-20','{flight,hotel}') returning id`, [org1])).rows[0].id
await as(U1, `insert into lead_followups (org_id,lead_id,action,due_at) values ($1,$2,'call','2026-11-18 03:30+00')`, [org1, lead])
const nf = (await db.query(`select next_followup_at from leads where id=$1`, [lead])).rows[0].next_followup_at
ok(nf !== null, 'lead next_followup_at maintained by trigger')

// customer + supplier
const g = async k => (await db.query(`select id from account_groups where org_id=$1 and system_key=$2`, [org1, k])).rows[0].id
const cust = (await as(U1, `insert into ledgers (org_id,group_id,name,kind) values ($1,$2,'Ravi Kumar','customer') returning id`, [org1, await g('sundry_debtors')])).rows[0].id
const supp = (await as(U1, `insert into ledgers (org_id,group_id,name,kind) values ($1,$2,'Air Consolidator','supplier') returning id`, [org1, await g('sundry_creditors')])).rows[0].id
const bank = (await as(U1, `insert into ledgers (org_id,group_id,name,kind) values ($1,$2,'HDFC Bank','bank') returning id`, [org1, await g('bank_accounts')])).rows[0].id

// domestic air invoice: fare 5000 + XT 800 + fee 300 + 18% GST on fee (27 + 27) = 6154
const inv = (await as(U1, `insert into invoices (org_id,fy_id,bill_type,invoice_no,invoice_date,party_ledger_id)
  values ($1,$2,'domestic',$3,'2026-11-16',$4) returning id`, [org1, fy, n1, cust])).rows[0].id
await as(U1, `insert into invoice_lines (org_id,invoice_id,service,pax_name,pnr,sector,travel_date,
  basic,xt,service_fee,taxable,gst_rate,cgst,sgst,net_sale,
  supplier_ledger_id,purchase_gross,purchase_gst,commission,tds,net_purchase)
  values ($1,$2,'flight','RAVI KUMAR','ABC123','DEL-BOM','2026-12-20',
  500000,80000,30000,30000,18,2700,2700,615400,
  $3,580000,0,5000,250,575250)`, [org1, inv, supp])
await throws(`insert into invoice_lines (org_id,invoice_id,service,basic,net_sale) values ('${org1}','${inv}','flight',100,999)`, 'line arithmetic check rejects bad net_sale')

await as(U1, `select app.post_invoice($1)`, [inv])
const tot = (await db.query(`select total,status,purchase_total from invoices where id=$1`, [inv])).rows[0]
ok(tot.total === 615400 && tot.status === 'posted', `invoice posted, total ${tot.total}`)
const bal = (await db.query(`select sum(debit)::bigint d, sum(credit)::bigint c, count(*)::int n from ledger_entries where source_id=$1`, [inv])).rows[0]
ok(bal.d === bal.c, `invoice GL balanced: Dr ${bal.d} = Cr ${bal.c} over ${bal.n} rows`)

// receipt of full amount, allocated
const rv = (await as(U1, `insert into vouchers (org_id,fy_id,kind,voucher_no,voucher_date,party_ledger_id,cash_bank_ledger_id,amount,mode)
  values ($1,$2,'receipt','RV-0001','2026-11-17',$3,$4,615400,'upi') returning id`, [org1, fy, cust, bank])).rows[0].id
await as(U1, `insert into voucher_lines (org_id,voucher_id,ledger_id,debit,credit) values ($1,$2,$3,615400,0),($1,$2,$4,0,615400)`, [org1, rv, bank, cust])
await as(U1, `select app.post_voucher($1)`, [rv])
await as(U1, `insert into bill_allocations (org_id,voucher_id,invoice_id,amount) values ($1,$2,$3,615400)`, [org1, rv, inv])
const vb = (await as(U1, `select pay_status, balance from v_invoice_balance where id=$1`, [inv])).rows[0]
ok(vb.pay_status === 'paid' && Number(vb.balance) === 0, `invoice shows paid (${vb.pay_status})`)

// unbalanced journal must fail at commit
const jv = (await as(U1, `insert into vouchers (org_id,fy_id,kind,voucher_no,voucher_date,amount) values ($1,$2,'journal','JV-1','2026-11-17',100) returning id`, [org1, fy])).rows[0].id
await as(U1, `insert into voucher_lines (org_id,voucher_id,ledger_id,debit,credit) values ($1,$2,$3,100,0)`, [org1, jv, bank])
try { await as(U1, `select app.post_voucher($1)`, [jv]); ok(false, 'unbalanced voucher rejected') }
catch (e) { ok(true, 'unbalanced voucher rejected -> ' + e.message.split('\n')[0]) }

// users cannot write the GL directly
try { await as(U1, `insert into ledger_entries (org_id,fy_id,entry_date,ledger_id,debit,source_type,source_id,doc_no) values ($1,$2,'2026-11-17',$3,1,'voucher',gen_random_uuid(),'x')`, [org1, fy, bank]); ok(false, 'direct GL write blocked') }
catch (e) { ok(true, 'direct GL write blocked') }

// date outside FY rejected
const rv2 = (await as(U1, `insert into vouchers (org_id,fy_id,kind,voucher_no,voucher_date,amount) values ($1,$2,'contra','CV-1','2028-01-01',10) returning id`, [org1, fy])).rows[0].id
await as(U1, `insert into voucher_lines (org_id,voucher_id,ledger_id,debit,credit) values ($1,$2,$3,10,0),($1,$2,$4,0,10)`, [org1, rv2, bank, (await db.query(`select app.sys_ledger($1,'cash') id`, [org1])).rows[0].id])
try { await as(U1, `select app.post_voucher($1)`, [rv2]); ok(false, 'out-of-year date rejected') }
catch (e) { ok(true, 'out-of-year date rejected') }

// trial balance sums to zero
const tb = (await as(U1, `select sum(closing)::bigint s, count(*)::int n from app.ledger_balances($1,$2,'2026-04-01','2027-03-31')`, [org1, fy])).rows[0]
ok(Number(tb.s) === 0, `trial balance nets to zero across ${tb.n} ledgers`)

// credit note reverses
const cn = (await as(U1, `insert into invoices (org_id,fy_id,doc_kind,bill_type,invoice_no,invoice_date,party_ledger_id,ref_invoice_id)
  values ($1,$2,'credit_note','domestic','CN-0001','2026-11-20',$3,$4) returning id`, [org1, fy, cust, inv])).rows[0].id
await as(U1, `insert into invoice_lines (org_id,invoice_id,service,basic,taxable,net_sale) values ($1,$2,'flight',100000,0,100000)`, [org1, cn])
await as(U1, `select app.post_invoice($1)`, [cn])
const cnp = (await db.query(`select credit from ledger_entries where source_id=$1 and ledger_id=$2`, [cn, cust])).rows[0]
ok(cnp && Number(cnp.credit) === 100000, 'credit note credits the customer')

// posted invoice cannot be deleted
const del = await as(U1, `delete from invoices where id=$1 returning id`, [inv])
ok(del.rows.length === 0, 'posted invoice delete blocked by RLS')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
