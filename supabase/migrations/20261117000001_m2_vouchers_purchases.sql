-- =====================================================================
-- Migration 0004 (Milestone 2): credit notes, payment / contra / journal
-- vouchers, general purchase bills, invoice balances that account for
-- credit notes and refunds, day book, monthly sales and ageing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- System ledgers that may not exist in companies created earlier
-- ---------------------------------------------------------------------
create or replace function app.ensure_sys_ledger(p_org uuid, p_key text, p_name text, p_group_key text, p_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  v := app.sys_ledger(p_org, p_key);
  if v is null then
    insert into ledgers (org_id, group_id, name, kind, system_key)
    select p_org, g.id, p_name, p_kind, p_key from account_groups g
    where g.org_id = p_org and g.system_key = p_group_key
    on conflict (org_id, system_key) do nothing
    returning id into v;
    v := coalesce(v, app.sys_ledger(p_org, p_key));
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Posting invoices and credit notes.
-- Same as 0001, plus: lines of service 'cancellation_charge' (only on
-- credit notes, entered with negative amounts) post to a separate
-- "Cancellation Charges" income ledger instead of sales.
-- ---------------------------------------------------------------------
create or replace function app.post_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv invoices;
  s integer;
  l record;
  v_sales uuid;
  v_purchase uuid;
  v_cancel uuid;
  v_charges bigint;
begin
  select * into inv from invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if not app.can(inv.org_id, 'invoice', 'post') then raise exception 'permission denied'; end if;
  if inv.doc_kind = 'proforma' then raise exception 'proformas are not posted'; end if;
  if inv.status = 'cancelled' then raise exception 'invoice is cancelled'; end if;

  s := case inv.doc_kind when 'credit_note' then -1 else 1 end;
  v_sales    := app.sys_ledger(inv.org_id, 'sales_' || inv.bill_type);
  v_purchase := app.sys_ledger(inv.org_id, 'purchase_' || inv.bill_type);
  if v_sales is null or v_purchase is null then
    raise exception 'missing system ledgers for bill type %', inv.bill_type;
  end if;

  delete from ledger_entries where source_type = 'invoice' and source_id = inv.id;

  update invoices i set
    sale_before_tax = t.sbt, taxable = t.taxable, cgst = t.cgst, sgst = t.sgst,
    igst = t.igst, total = t.total, purchase_total = t.purchase, cancel_charges = t.charges,
    status = 'posted', posted_at = coalesce(i.posted_at, now())
  from (
    select coalesce(sum(net_sale - cgst - sgst - igst),0) sbt, coalesce(sum(taxable),0) taxable,
           coalesce(sum(cgst),0) cgst, coalesce(sum(sgst),0) sgst, coalesce(sum(igst),0) igst,
           coalesce(sum(net_sale),0) total, coalesce(sum(net_purchase),0) purchase,
           -coalesce(sum(net_sale - cgst - sgst - igst) filter (where service = 'cancellation_charge'),0) charges
    from invoice_lines where invoice_id = inv.id
  ) t
  where i.id = inv.id
  returning i.* into inv;

  v_charges := inv.cancel_charges;   -- positive amount of charges (ex GST)
  if v_charges <> 0 then
    v_cancel := app.ensure_sys_ledger(inv.org_id, 'cancellation_income', 'Cancellation Charges', 'direct_income', 'income');
  end if;

  -- SALE: Dr party / Cr sales (+ cancellation income) + output GST
  insert into ledger_entries (org_id, fy_id, entry_date, ledger_id, debit, credit, source_type, source_id, doc_no, narration)
  select inv.org_id, inv.fy_id, inv.invoice_date, x.ledger_id,
         greatest(s * x.amt, 0), greatest(-s * x.amt, 0), 'invoice', inv.id, inv.invoice_no, x.narr
  from (values
      (inv.party_ledger_id,                       inv.total,                          case s when 1 then 'Sale' else 'Credit note' end),
      (v_sales,                                  -(inv.sale_before_tax + v_charges),  case s when 1 then 'Sale' else 'Sale reversed' end),
      (v_cancel,                                  v_charges,                          'Cancellation charges'),
      (app.sys_ledger(inv.org_id,'cgst_output'), -inv.cgst,                           'CGST'),
      (app.sys_ledger(inv.org_id,'sgst_output'), -inv.sgst,                           'SGST'),
      (app.sys_ledger(inv.org_id,'igst_output'), -inv.igst,                           'IGST')
  ) as x(ledger_id, amt, narr)
  where x.amt <> 0 and x.ledger_id is not null;

  for l in
    select supplier_ledger_id,
           sum(purchase_gross - purchase_gst) pur, sum(purchase_gst) itc,
           sum(commission) comm, sum(tds) tds, sum(net_purchase) payable
    from invoice_lines
    where invoice_id = inv.id and supplier_ledger_id is not null
    group by supplier_ledger_id
  loop
    insert into ledger_entries (org_id, fy_id, entry_date, ledger_id, debit, credit, source_type, source_id, doc_no, narration)
    select inv.org_id, inv.fy_id, inv.invoice_date, x.ledger_id,
           greatest(s * x.amt, 0), greatest(-s * x.amt, 0), 'invoice', inv.id, inv.invoice_no, x.narr
    from (values
        (v_purchase,                                     l.pur,      case s when 1 then 'Purchase' else 'Supplier refund' end),
        (app.sys_ledger(inv.org_id,'gst_input'),         l.itc,      'Input GST'),
        (app.sys_ledger(inv.org_id,'tds_receivable'),    l.tds,      'TDS on commission'),
        (app.sys_ledger(inv.org_id,'commission_income'), -l.comm,    'Commission'),
        (l.supplier_ledger_id,                           -l.payable, case s when 1 then 'Purchase' else 'Supplier refund' end)
    ) as x(ledger_id, amt, narr)
    where x.amt <> 0;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Balances
--   invoice balance = total − receipts adjusted + refunds paid − credit notes
--   negative balance = refund due to the client
-- ---------------------------------------------------------------------
drop view if exists v_invoice_balance;
create view v_invoice_balance with (security_invoker = true) as
select i.id, i.org_id, i.fy_id, i.doc_kind, i.bill_type, i.invoice_no, i.invoice_date, i.due_date,
       i.party_ledger_id, i.total,
       coalesce(a.received, 0) - coalesce(a.refunded, 0) + coalesce(cn.credited, 0) as allocated,
       i.total - coalesce(a.received, 0) + coalesce(a.refunded, 0) - coalesce(cn.credited, 0) as balance,
       coalesce(cn.credited, 0) as credited,
       case
         when i.total - coalesce(a.received,0) + coalesce(a.refunded,0) - coalesce(cn.credited,0) < 0 then 'refund_due'
         when i.total - coalesce(a.received,0) + coalesce(a.refunded,0) - coalesce(cn.credited,0) = 0 then
           case when coalesce(cn.credited,0) >= i.total and coalesce(a.received,0) = 0 then 'cancelled' else 'paid' end
         when coalesce(a.received,0) + coalesce(cn.credited,0) = 0 then 'unpaid'
         else 'partial'
       end as pay_status
from invoices i
left join (
  select ba.invoice_id,
         sum(ba.amount) filter (where v.kind = 'receipt') as received,
         sum(ba.amount) filter (where v.kind = 'payment') as refunded
  from bill_allocations ba join vouchers v on v.id = ba.voucher_id and v.status = 'posted'
  where ba.invoice_id is not null
  group by ba.invoice_id
) a on a.invoice_id = i.id
left join (
  select ref_invoice_id, sum(total) as credited from invoices
  where doc_kind = 'credit_note' and status = 'posted' and ref_invoice_id is not null
  group by ref_invoice_id
) cn on cn.ref_invoice_id = i.id
where i.status = 'posted' and i.doc_kind = 'invoice';

create view v_purchase_balance with (security_invoker = true) as
select b.id, b.org_id, b.fy_id, b.kind, b.bill_no, b.bill_date, b.supplier_ledger_id, b.supplier_bill_no, b.total,
       coalesce(a.paid, 0) as paid,
       b.total - coalesce(a.paid, 0) as balance
from purchase_bills b
left join (
  select ba.purchase_bill_id, sum(ba.amount) as paid
  from bill_allocations ba join vouchers v on v.id = ba.voucher_id and v.status = 'posted' and v.kind = 'payment'
  where ba.purchase_bill_id is not null group by ba.purchase_bill_id
) a on a.purchase_bill_id = b.id
where b.status = 'posted';

-- ---------------------------------------------------------------------
-- Invoices: adds booked_by and credit-note checks to 0002's save_invoice
-- ---------------------------------------------------------------------
create or replace function public.save_invoice(p_org uuid, p_header jsonb, p_lines jsonb, p_post boolean default true)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(p_header->>'id','')::uuid;
  v_kind text := coalesce(nullif(p_header->>'doc_kind',''), 'invoice');
  v_date date := (p_header->>'invoice_date')::date;
  v_party uuid := (p_header->>'party_ledger_id')::uuid;
  v_pos uuid := nullif(p_header->>'place_of_supply_state_id','')::uuid;
  v_ref uuid := nullif(p_header->>'ref_invoice_id','')::uuid;
  v_booked uuid := nullif(p_header->>'booked_by_id','')::uuid;
  v_inter boolean;
  v_fy uuid;
  v_bad int;
begin
  if not app.can(p_org, 'invoice', case when v_id is null then 'create' else 'edit' end) then
    raise exception 'permission denied';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'an invoice needs at least one line';
  end if;
  v_fy := app.fy_for_date(p_org, v_date);
  if v_fy is null then raise exception 'no open financial year for %', v_date; end if;

  perform app.assert_ledgers_in_org(p_org,
    array[v_party] || array(select nullif(x->>'supplier_ledger_id','')::uuid from jsonb_array_elements(p_lines) x));
  if v_booked is not null and not exists (select 1 from lookups where id = v_booked and org_id = p_org and kind = 'booked_by') then
    raise exception 'unknown "booked by"';
  end if;

  if v_kind = 'credit_note' then
    if v_ref is null or not exists (
      select 1 from invoices where id = v_ref and org_id = p_org and doc_kind = 'invoice'
        and status = 'posted' and party_ledger_id = v_party) then
      raise exception 'a credit note must refer to a posted invoice of the same client';
    end if;
    if exists (select 1 from jsonb_array_elements(p_lines) x where x->>'service' = 'cancellation_charge'
               and coalesce((x->>'net_sale')::bigint, 0) > 0) then
      raise exception 'cancellation charges must reduce the refund';
    end if;
  elsif exists (select 1 from jsonb_array_elements(p_lines) x where x->>'service' = 'cancellation_charge') then
    raise exception 'cancellation charges belong on a credit note';
  end if;
  if v_kind = 'invoice' and exists (
      select 1 from jsonb_array_elements(p_lines) x
      where coalesce((x->>'basic')::bigint,0) < 0 or coalesce((x->>'xt')::bigint,0) < 0
         or coalesce((x->>'service_fee')::bigint,0) < 0 or coalesce((x->>'other_charges')::bigint,0) < 0) then
    raise exception 'invoice amounts cannot be negative';
  end if;

  select o.state_id is distinct from coalesce(v_pos, o.state_id) into v_inter from orgs o where o.id = p_org;

  if v_id is null then
    insert into invoices (org_id, fy_id, doc_kind, bill_type, invoice_no, invoice_date, due_date,
      party_ledger_id, booked_by_id, contact_phone, place_of_supply_state_id, is_interstate, lead_id,
      ref_invoice_id, notes, created_by)
    values (p_org, v_fy, v_kind, p_header->>'bill_type', app.next_doc_no(p_org, v_fy, v_kind), v_date,
      nullif(p_header->>'due_date','')::date, v_party, v_booked, nullif(p_header->>'contact_phone',''), v_pos,
      v_inter, nullif(p_header->>'lead_id','')::uuid, v_ref, nullif(p_header->>'notes',''), app.member_id(p_org))
    returning id into v_id;
  else
    update invoices set
      bill_type = p_header->>'bill_type', invoice_date = v_date,
      due_date = nullif(p_header->>'due_date','')::date, party_ledger_id = v_party, booked_by_id = v_booked,
      contact_phone = nullif(p_header->>'contact_phone',''), place_of_supply_state_id = v_pos,
      is_interstate = v_inter, notes = nullif(p_header->>'notes','')
    where id = v_id and org_id = p_org and status <> 'cancelled' and fy_id = v_fy and doc_kind = v_kind;
    if not found then raise exception 'invoice not found, cancelled, or moved across years'; end if;
    delete from invoice_lines where invoice_id = v_id;
  end if;

  insert into invoice_lines (org_id, invoice_id, sort, service, description, passenger_id, pax_name, pax_type,
    airline_id, flight_no, pnr, ticket_no, sector, travel_date, return_date, details,
    basic, xt, service_fee, other_charges, discount, taxable, gst_rate, cgst, sgst, igst, net_sale,
    supplier_ledger_id, supplier_invoice_no, supplier_invoice_date,
    purchase_gross, purchase_gst, commission, tds, net_purchase)
  select p_org, v_id, (r.ordinality - 1)::smallint, r.service, r.description, r.passenger_id, r.pax_name, r.pax_type,
    r.airline_id, r.flight_no, r.pnr, r.ticket_no, r.sector, r.travel_date, r.return_date, coalesce(r.details, '{}'),
    coalesce(r.basic,0), coalesce(r.xt,0), coalesce(r.service_fee,0), coalesce(r.other_charges,0),
    coalesce(r.discount,0), coalesce(r.taxable,0), coalesce(r.gst_rate,0),
    coalesce(r.cgst,0), coalesce(r.sgst,0), coalesce(r.igst,0), coalesce(r.net_sale,0),
    r.supplier_ledger_id, r.supplier_invoice_no, r.supplier_invoice_date,
    coalesce(r.purchase_gross,0), coalesce(r.purchase_gst,0), coalesce(r.commission,0),
    coalesce(r.tds,0), coalesce(r.net_purchase,0)
  from jsonb_populate_recordset(null::invoice_lines, p_lines) with ordinality as r;

  if exists (select 1 from invoice_lines l where l.invoice_id = v_id and l.passenger_id is not null
             and not exists (select 1 from passengers p where p.id = l.passenger_id and p.org_id = p_org)) then
    raise exception 'passenger does not belong to this company';
  end if;

  select count(*) into v_bad from invoice_lines
  where invoice_id = v_id and ((v_inter and (cgst <> 0 or sgst <> 0)) or (not v_inter and igst <> 0));
  if v_bad > 0 then
    raise exception 'GST split does not match place of supply (%)', case when v_inter then 'IGST expected' else 'CGST+SGST expected' end;
  end if;
  if v_kind = 'credit_note' and (select sum(net_sale) from invoice_lines where invoice_id = v_id) <= 0 then
    raise exception 'the refund after charges must be more than zero';
  end if;

  if p_post and v_kind <> 'proforma' then
    perform app.post_invoice(v_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Payment / contra / journal
--   payment: {kind:'payment', party_ledger_id (paid to), cash_bank_ledger_id (paid from), amount,
--             allocations:[{invoice_id|purchase_bill_id, amount}]}
--   contra:  {kind:'contra', cash_bank_ledger_id (from), party_ledger_id (to), amount}
--   journal: {kind:'journal', lines:[{ledger_id, debit, credit, narration}]}
-- common:   voucher_date, mode?, cheque_no?, cheque_date?, cheque_bank?, reference?, narration?
-- ---------------------------------------------------------------------
create or replace function public.save_voucher(p_org uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_kind text := p->>'kind';
  v_date date := (p->>'voucher_date')::date;
  v_amount bigint := coalesce((p->>'amount')::bigint, 0);
  v_party uuid := nullif(p->>'party_ledger_id','')::uuid;
  v_bank uuid := nullif(p->>'cash_bank_ledger_id','')::uuid;
  v_fy uuid;
  v_dr bigint; v_cr bigint; v_n int;
  v_alloc_total bigint := 0;
  a record;
begin
  if v_kind not in ('payment','contra','journal') then raise exception 'unknown voucher type %', v_kind; end if;
  if not app.can(p_org, 'voucher', 'create') then raise exception 'permission denied'; end if;
  v_fy := app.fy_for_date(p_org, v_date);
  if v_fy is null then raise exception 'no open financial year for %', v_date; end if;

  if v_kind in ('payment','contra') then
    if v_amount <= 0 then raise exception 'amount must be positive'; end if;
    if v_party is null or v_bank is null then raise exception 'choose both accounts'; end if;
    if v_party = v_bank then raise exception 'the two accounts must differ'; end if;
    perform app.assert_ledgers_in_org(p_org, array[v_party, v_bank]);
    if not exists (select 1 from ledgers where id = v_bank and kind in ('bank','cash')) then
      raise exception 'money must come from a cash or bank account';
    end if;
    if v_kind = 'contra' and not exists (select 1 from ledgers where id = v_party and kind in ('bank','cash')) then
      raise exception 'contra moves money between cash and bank accounts only';
    end if;
    if v_kind = 'payment' and exists (select 1 from ledgers where id = v_party and kind in ('bank','cash')) then
      raise exception 'use a contra entry to move money between cash and bank';
    end if;
  else
    select count(*), coalesce(sum((x->>'debit')::bigint),0), coalesce(sum((x->>'credit')::bigint),0)
      into v_n, v_dr, v_cr
    from jsonb_array_elements(coalesce(p->'lines','[]')) x;
    if v_n < 2 then raise exception 'a journal needs at least two lines'; end if;
    if v_dr <> v_cr or v_dr <= 0 then raise exception 'debits (%) must equal credits (%)', v_dr, v_cr; end if;
    perform app.assert_ledgers_in_org(p_org, array(select (x->>'ledger_id')::uuid from jsonb_array_elements(p->'lines') x));
    v_amount := v_dr;
  end if;

  insert into vouchers (org_id, fy_id, kind, voucher_no, voucher_date, party_ledger_id, cash_bank_ledger_id,
    amount, mode, cheque_no, cheque_date, cheque_bank, reference, narration, created_by)
  values (p_org, v_fy, v_kind, app.next_doc_no(p_org, v_fy, v_kind), v_date, v_party, v_bank, v_amount,
    case when v_kind = 'journal' then 'adjustment' else coalesce(nullif(p->>'mode',''), 'cash') end,
    nullif(p->>'cheque_no',''), nullif(p->>'cheque_date','')::date, nullif(p->>'cheque_bank',''),
    nullif(p->>'reference',''), nullif(p->>'narration',''), app.member_id(p_org))
  returning id into v_id;

  if v_kind in ('payment','contra') then
    -- money goes to v_party (Dr) from v_bank (Cr)
    insert into voucher_lines (org_id, voucher_id, sort, ledger_id, debit, credit) values
      (p_org, v_id, 0, v_party, v_amount, 0),
      (p_org, v_id, 1, v_bank, 0, v_amount);
  else
    insert into voucher_lines (org_id, voucher_id, sort, ledger_id, debit, credit, narration)
    select p_org, v_id, (x.ordinality - 1)::smallint, (x.value->>'ledger_id')::uuid,
           coalesce((x.value->>'debit')::bigint,0), coalesce((x.value->>'credit')::bigint,0), nullif(x.value->>'narration','')
    from jsonb_array_elements(p->'lines') with ordinality as x;
  end if;

  if v_kind = 'payment' then
    for a in select nullif(x->>'invoice_id','')::uuid as invoice_id, nullif(x->>'purchase_bill_id','')::uuid as bill_id,
                    (x->>'amount')::bigint as amount
             from jsonb_array_elements(coalesce(p->'allocations','[]')) x
             where coalesce((x->>'amount')::bigint, 0) > 0
    loop
      if a.invoice_id is not null then
        -- refund to a client against an invoice whose balance is negative
        if not exists (select 1 from v_invoice_balance b where b.id = a.invoice_id and b.org_id = p_org
                       and b.party_ledger_id = v_party and -b.balance >= a.amount) then
          raise exception 'refund exceeds the amount due back on that invoice';
        end if;
      elsif not exists (select 1 from v_purchase_balance b where b.id = a.bill_id and b.org_id = p_org
                        and b.supplier_ledger_id = v_party and b.balance >= a.amount) then
        raise exception 'payment exceeds the purchase bill balance';
      end if;
      insert into bill_allocations (org_id, voucher_id, invoice_id, purchase_bill_id, amount)
      values (p_org, v_id, a.invoice_id, a.bill_id, a.amount);
      v_alloc_total := v_alloc_total + a.amount;
    end loop;
    if v_alloc_total > v_amount then raise exception 'allocations exceed the payment amount'; end if;
  end if;

  perform app.post_voucher(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- General purchase bills
--   p_header: {id?, supplier_ledger_id, bill_date, supplier_bill_no?, supplier_bill_date?,
--              place_of_supply_state_id?, tds?, notes?}
--   p_lines:  [{ledger_id, description?, taxable, gst_rate, cgst, sgst, igst, amount}]
-- ---------------------------------------------------------------------
create or replace function public.save_purchase_bill(p_org uuid, p_header jsonb, p_lines jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(p_header->>'id','')::uuid;
  v_date date := (p_header->>'bill_date')::date;
  v_supp uuid := (p_header->>'supplier_ledger_id')::uuid;
  v_pos uuid := nullif(p_header->>'place_of_supply_state_id','')::uuid;
  v_inter boolean;
  v_fy uuid;
begin
  if not app.can(p_org, 'purchase', case when v_id is null then 'create' else 'edit' end) then
    raise exception 'permission denied';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'a bill needs at least one line'; end if;
  v_fy := app.fy_for_date(p_org, v_date);
  if v_fy is null then raise exception 'no open financial year for %', v_date; end if;
  perform app.assert_ledgers_in_org(p_org,
    array[v_supp] || array(select (x->>'ledger_id')::uuid from jsonb_array_elements(p_lines) x));
  if exists (select 1 from jsonb_array_elements(p_lines) x join ledgers l on l.id = (x->>'ledger_id')::uuid
             where l.kind in ('bank','cash','customer','supplier')) then
    raise exception 'purchase lines must use expense or asset accounts';
  end if;
  select o.state_id is distinct from coalesce(v_pos, o.state_id) into v_inter from orgs o where o.id = p_org;

  if v_id is null then
    insert into purchase_bills (org_id, fy_id, kind, bill_no, bill_date, supplier_ledger_id, supplier_bill_no,
      supplier_bill_date, place_of_supply_state_id, tds, notes, created_by)
    values (p_org, v_fy, 'general', app.next_doc_no(p_org, v_fy, 'purchase_general'), v_date, v_supp,
      nullif(p_header->>'supplier_bill_no',''), nullif(p_header->>'supplier_bill_date','')::date, v_pos,
      coalesce((p_header->>'tds')::bigint, 0), nullif(p_header->>'notes',''), app.member_id(p_org))
    returning id into v_id;
  else
    update purchase_bills set bill_date = v_date, supplier_ledger_id = v_supp,
      supplier_bill_no = nullif(p_header->>'supplier_bill_no',''),
      supplier_bill_date = nullif(p_header->>'supplier_bill_date','')::date,
      place_of_supply_state_id = v_pos, tds = coalesce((p_header->>'tds')::bigint, 0),
      notes = nullif(p_header->>'notes','')
    where id = v_id and org_id = p_org and kind = 'general' and status <> 'cancelled' and fy_id = v_fy;
    if not found then raise exception 'bill not found, cancelled, or moved across years'; end if;
    delete from purchase_bill_lines where purchase_bill_id = v_id;
  end if;

  insert into purchase_bill_lines (org_id, purchase_bill_id, sort, ledger_id, description, taxable, gst_rate, cgst, sgst, igst, amount)
  select p_org, v_id, (x.ordinality - 1)::smallint, (x.value->>'ledger_id')::uuid, nullif(x.value->>'description',''),
         (x.value->>'taxable')::bigint, coalesce((x.value->>'gst_rate')::numeric, 0),
         coalesce((x.value->>'cgst')::bigint,0), coalesce((x.value->>'sgst')::bigint,0), coalesce((x.value->>'igst')::bigint,0),
         (x.value->>'amount')::bigint
  from jsonb_array_elements(p_lines) with ordinality as x;

  if exists (select 1 from purchase_bill_lines where purchase_bill_id = v_id
             and ((v_inter and (cgst <> 0 or sgst <> 0)) or (not v_inter and igst <> 0))) then
    raise exception 'GST split does not match place of supply';
  end if;
  if (select sum(amount) from purchase_bill_lines where purchase_bill_id = v_id)
     <= coalesce((p_header->>'tds')::bigint, 0) then
    raise exception 'TDS cannot be more than the bill';
  end if;

  perform app.post_purchase_bill(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
create or replace function public.day_book(p_org uuid, p_fy uuid, p_from date, p_to date)
returns table (entry_date date, doc_no text, source_type text, source_id uuid, ledger_id uuid,
               ledger_name text, debit bigint, credit bigint, narration text)
language sql stable security invoker set search_path = public as $$
  select e.entry_date, e.doc_no, e.source_type, e.source_id, e.ledger_id, l.name, e.debit, e.credit, e.narration
  from ledger_entries e join ledgers l on l.id = e.ledger_id
  where e.org_id = p_org and e.fy_id = p_fy and e.entry_date between p_from and p_to
  order by e.entry_date, e.doc_no, e.source_id, e.debit desc, e.id;
$$;

create or replace function public.monthly_sales(p_org uuid, p_fy uuid)
returns table (month date, sales bigint, margin bigint)
language sql stable security invoker set search_path = public as $$
  with fy as (select starts_on, ends_on from financial_years where id = p_fy and org_id = p_org),
  months as (
    select generate_series(date_trunc('month', fy.starts_on), date_trunc('month', fy.ends_on), interval '1 month')::date as month
    from fy
  ),
  s as (
    select date_trunc('month', invoice_date)::date as month,
           sum(case doc_kind when 'credit_note' then -total else total end)::bigint as sales
    from invoices where org_id = p_org and fy_id = p_fy and status = 'posted' and doc_kind in ('invoice','credit_note')
    group by 1
  ),
  m as (
    select date_trunc('month', invoice_date)::date as month,
           sum(case doc_kind when 'credit_note' then -margin else margin end)::bigint as margin
    from v_invoice_line_margin where org_id = p_org
      and invoice_id in (select id from invoices where fy_id = p_fy)
    group by 1
  )
  select months.month, coalesce(s.sales, 0), coalesce(m.margin, 0)
  from months left join s using (month) left join m using (month)
  order by months.month;
$$;

create or replace function public.receivable_ageing(p_org uuid)
returns table (bucket text, sort int, amount bigint, invoices bigint)
language sql stable security invoker set search_path = public as $$
  with b as (
    select balance, current_date - coalesce(due_date, invoice_date) as age
    from v_invoice_balance where org_id = p_org and balance > 0
  ), buckets(bucket, sort, lo, hi) as (values
    ('Not due', 0, -100000, 0), ('1–7 days', 1, 1, 7), ('8–15 days', 2, 8, 15),
    ('16–30 days', 3, 16, 30), ('31–60 days', 4, 31, 60), ('Over 60 days', 5, 61, 100000))
  select k.bucket, k.sort, coalesce(sum(b.balance), 0)::bigint, count(b.balance)
  from buckets k left join b on b.age between k.lo and k.hi
  group by k.bucket, k.sort order by k.sort;
$$;

-- v_invoice_balance was recreated: functions that referenced it compile on call, nothing else to do.

revoke execute on function public.save_voucher(uuid, jsonb) from public, anon;
revoke execute on function public.save_purchase_bill(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.day_book(uuid, uuid, date, date) from public, anon;
revoke execute on function public.monthly_sales(uuid, uuid) from public, anon;
revoke execute on function public.receivable_ageing(uuid) from public, anon;
grant execute on function public.save_voucher(uuid, jsonb) to authenticated;
grant execute on function public.save_purchase_bill(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.day_book(uuid, uuid, date, date) to authenticated;
grant execute on function public.monthly_sales(uuid, uuid) to authenticated;
grant execute on function public.receivable_ageing(uuid) to authenticated;
grant execute on all functions in schema app to authenticated;
grant select on v_invoice_balance, v_purchase_balance to authenticated;
