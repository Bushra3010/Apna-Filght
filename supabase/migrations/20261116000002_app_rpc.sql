-- =====================================================================
-- Migration 0002: functions the web app calls (exposed via PostgREST RPC)
--
-- Each save_* function runs in ONE transaction: number the document,
-- write header + lines, post to the ledger. Either all of it happens or
-- none of it. They run as the caller (security invoker), so RLS applies
-- to every row they write; numbering and posting go through app.*.
-- =====================================================================

-- every ledger a document references must belong to the same org
create or replace function app.assert_ledgers_in_org(p_org uuid, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_bad int;
begin
  select count(*) into v_bad
  from unnest(p_ids) as x(id)
  where x.id is not null
    and not exists (select 1 from ledgers l where l.id = x.id and l.org_id = p_org);
  if v_bad > 0 then raise exception 'ledger does not belong to this company'; end if;
end $$;

create or replace function app.fy_for_date(p_org uuid, p_date date) returns uuid
language sql stable security definer set search_path = public as $$
  select id from financial_years
  where org_id = p_org and p_date between starts_on and ends_on and not is_closed;
$$;

-- ---------------------------------------------------------------------
-- Company bootstrap
-- ---------------------------------------------------------------------
create or replace function public.create_org(p_name text, p_state_gst_code text, p_fy_start date)
returns uuid language sql security invoker set search_path = public as $$
  select app.create_org(p_name, p_state_gst_code::char(2), p_fy_start);
$$;

-- ---------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------
create or replace function public.save_lead(p_org uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_date date := coalesce(nullif(p->>'enquiry_date','')::date, current_date);
  v_fy uuid;
  v_services text[] := coalesce(array(select jsonb_array_elements_text(p->'services')), '{}');
begin
  if not app.can(p_org, 'lead', case when v_id is null then 'create' else 'edit' end) then
    raise exception 'permission denied';
  end if;
  perform app.assert_ledgers_in_org(p_org, array[nullif(p->>'party_ledger_id','')::uuid]);

  if v_id is null then
    v_fy := app.fy_for_date(p_org, v_date);
    if v_fy is null then raise exception 'no open financial year for %', v_date; end if;
    insert into leads (org_id, lead_no, enquiry_date, guest_name, email, phone, party_ledger_id,
      start_place, travel_date, travel_date_open, services, adults, children_above_12, children_6_12,
      infants, source, reference, budget, remarks, status, assigned_to, created_by)
    values (p_org, app.next_doc_no(p_org, v_fy, 'lead'), v_date, p->>'guest_name', nullif(p->>'email',''),
      p->>'phone', nullif(p->>'party_ledger_id','')::uuid, nullif(p->>'start_place',''),
      nullif(p->>'travel_date','')::date, coalesce((p->>'travel_date_open')::boolean, false), v_services,
      coalesce((p->>'adults')::smallint, 1), coalesce((p->>'children_above_12')::smallint, 0),
      coalesce((p->>'children_6_12')::smallint, 0), coalesce((p->>'infants')::smallint, 0),
      nullif(p->>'source',''), nullif(p->>'reference',''), nullif(p->>'budget','')::bigint,
      nullif(p->>'remarks',''), coalesce(nullif(p->>'status',''), 'initial'),
      coalesce(nullif(p->>'assigned_to','')::uuid, app.member_id(p_org)), app.member_id(p_org))
    returning id into v_id;
  else
    update leads set
      guest_name = p->>'guest_name', email = nullif(p->>'email',''), phone = p->>'phone',
      party_ledger_id = nullif(p->>'party_ledger_id','')::uuid, start_place = nullif(p->>'start_place',''),
      travel_date = nullif(p->>'travel_date','')::date,
      travel_date_open = coalesce((p->>'travel_date_open')::boolean, false), services = v_services,
      adults = coalesce((p->>'adults')::smallint, 1),
      children_above_12 = coalesce((p->>'children_above_12')::smallint, 0),
      children_6_12 = coalesce((p->>'children_6_12')::smallint, 0),
      infants = coalesce((p->>'infants')::smallint, 0),
      source = nullif(p->>'source',''), reference = nullif(p->>'reference',''),
      budget = nullif(p->>'budget','')::bigint, remarks = nullif(p->>'remarks',''),
      status = coalesce(nullif(p->>'status',''), status),
      assigned_to = coalesce(nullif(p->>'assigned_to','')::uuid, assigned_to)
    where id = v_id and org_id = p_org;
    if not found then raise exception 'lead not found'; end if;
  end if;

  if p ? 'followup' and coalesce(p->'followup'->>'due_at','') <> '' then
    insert into lead_followups (org_id, lead_id, action, due_at, created_by)
    values (p_org, v_id, coalesce(nullif(p->'followup'->>'action',''), 'call'),
            (p->'followup'->>'due_at')::timestamptz, app.member_id(p_org));
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Invoices (and later proformas / credit notes)
--   p_header: {id?, doc_kind?, bill_type, invoice_date, due_date?, party_ledger_id,
--              contact_phone?, place_of_supply_state_id?, lead_id?, ref_invoice_id?, notes?}
--   p_lines:  [ invoice_lines columns (amounts in paise) ]
-- The app computes GST; the database re-checks the arithmetic (check
-- constraints) and the CGST/SGST vs IGST choice (below).
-- ---------------------------------------------------------------------
create or replace function public.save_invoice(p_org uuid, p_header jsonb, p_lines jsonb, p_post boolean default true)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(p_header->>'id','')::uuid;
  v_kind text := coalesce(nullif(p_header->>'doc_kind',''), 'invoice');
  v_date date := (p_header->>'invoice_date')::date;
  v_party uuid := (p_header->>'party_ledger_id')::uuid;
  v_pos uuid := nullif(p_header->>'place_of_supply_state_id','')::uuid;
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

  select o.state_id is distinct from coalesce(v_pos, o.state_id) into v_inter from orgs o where o.id = p_org;

  if v_id is null then
    insert into invoices (org_id, fy_id, doc_kind, bill_type, invoice_no, invoice_date, due_date,
      party_ledger_id, contact_phone, place_of_supply_state_id, is_interstate, lead_id, ref_invoice_id,
      notes, created_by)
    values (p_org, v_fy, v_kind, p_header->>'bill_type', app.next_doc_no(p_org, v_fy, v_kind), v_date,
      nullif(p_header->>'due_date','')::date, v_party, nullif(p_header->>'contact_phone',''), v_pos, v_inter,
      nullif(p_header->>'lead_id','')::uuid, nullif(p_header->>'ref_invoice_id','')::uuid,
      nullif(p_header->>'notes',''), app.member_id(p_org))
    returning id into v_id;
  else
    update invoices set
      bill_type = p_header->>'bill_type', invoice_date = v_date,
      due_date = nullif(p_header->>'due_date','')::date, party_ledger_id = v_party,
      contact_phone = nullif(p_header->>'contact_phone',''), place_of_supply_state_id = v_pos,
      is_interstate = v_inter, notes = nullif(p_header->>'notes','')
    where id = v_id and org_id = p_org and status <> 'cancelled' and fy_id = v_fy;
    if not found then raise exception 'invoice not found, cancelled, or moved across years'; end if;
    delete from invoice_lines where invoice_id = v_id;
  end if;

  insert into invoice_lines (org_id, invoice_id, sort, service, description, pax_name, pax_type,
    airline_id, flight_no, pnr, ticket_no, sector, travel_date, return_date, details,
    basic, xt, service_fee, other_charges, discount, taxable, gst_rate, cgst, sgst, igst, net_sale,
    supplier_ledger_id, supplier_invoice_no, supplier_invoice_date,
    purchase_gross, purchase_gst, commission, tds, net_purchase)
  select p_org, v_id, (r.ordinality - 1)::smallint, r.service, r.description, r.pax_name, r.pax_type,
    r.airline_id, r.flight_no, r.pnr, r.ticket_no, r.sector, r.travel_date, r.return_date, coalesce(r.details, '{}'),
    coalesce(r.basic,0), coalesce(r.xt,0), coalesce(r.service_fee,0), coalesce(r.other_charges,0),
    coalesce(r.discount,0), coalesce(r.taxable,0), coalesce(r.gst_rate,0),
    coalesce(r.cgst,0), coalesce(r.sgst,0), coalesce(r.igst,0), coalesce(r.net_sale,0),
    r.supplier_ledger_id, r.supplier_invoice_no, r.supplier_invoice_date,
    coalesce(r.purchase_gross,0), coalesce(r.purchase_gst,0), coalesce(r.commission,0),
    coalesce(r.tds,0), coalesce(r.net_purchase,0)
  from jsonb_populate_recordset(null::invoice_lines, p_lines) with ordinality as r;

  -- intra-state => CGST+SGST only; inter-state => IGST only
  select count(*) into v_bad from invoice_lines
  where invoice_id = v_id and ((v_inter and (cgst <> 0 or sgst <> 0)) or (not v_inter and igst <> 0));
  if v_bad > 0 then
    raise exception 'GST split does not match place of supply (%)', case when v_inter then 'IGST expected' else 'CGST+SGST expected' end;
  end if;

  if p_post and v_kind <> 'proforma' then
    perform app.post_invoice(v_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Receipts
--   p: {party_ledger_id, cash_bank_ledger_id, amount, voucher_date, mode, cheque_no?, cheque_date?,
--       cheque_bank?, reference?, narration?, allocations: [{invoice_id, amount}]}
-- ---------------------------------------------------------------------
create or replace function public.save_receipt(p_org uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_date date := (p->>'voucher_date')::date;
  v_amount bigint := (p->>'amount')::bigint;
  v_party uuid := (p->>'party_ledger_id')::uuid;
  v_bank uuid := (p->>'cash_bank_ledger_id')::uuid;
  v_fy uuid;
  v_alloc_total bigint;
  a record;
begin
  if not app.can(p_org, 'voucher', 'create') then raise exception 'permission denied'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'amount must be positive'; end if;
  if v_party = v_bank then raise exception 'party and cash/bank account must differ'; end if;
  v_fy := app.fy_for_date(p_org, v_date);
  if v_fy is null then raise exception 'no open financial year for %', v_date; end if;
  perform app.assert_ledgers_in_org(p_org, array[v_party, v_bank]);
  if not exists (select 1 from ledgers where id = v_bank and kind in ('bank','cash')) then
    raise exception 'receipt must go into a cash or bank account';
  end if;

  insert into vouchers (org_id, fy_id, kind, voucher_no, voucher_date, party_ledger_id, cash_bank_ledger_id,
    amount, mode, cheque_no, cheque_date, cheque_bank, reference, narration, created_by)
  values (p_org, v_fy, 'receipt', app.next_doc_no(p_org, v_fy, 'receipt'), v_date, v_party, v_bank,
    v_amount, coalesce(nullif(p->>'mode',''), 'cash'), nullif(p->>'cheque_no',''),
    nullif(p->>'cheque_date','')::date, nullif(p->>'cheque_bank',''), nullif(p->>'reference',''),
    nullif(p->>'narration',''), app.member_id(p_org))
  returning id into v_id;

  insert into voucher_lines (org_id, voucher_id, sort, ledger_id, debit, credit) values
    (p_org, v_id, 0, v_bank, v_amount, 0),
    (p_org, v_id, 1, v_party, 0, v_amount);

  v_alloc_total := 0;
  for a in select (x->>'invoice_id')::uuid as invoice_id, (x->>'amount')::bigint as amount
           from jsonb_array_elements(coalesce(p->'allocations','[]')) x
           where coalesce((x->>'amount')::bigint, 0) > 0
  loop
    if not exists (select 1 from v_invoice_balance b
                   where b.id = a.invoice_id and b.org_id = p_org and b.doc_kind = 'invoice'
                     and b.party_ledger_id = v_party and b.balance >= a.amount) then
      raise exception 'allocation exceeds the invoice balance or invoice is for another party';
    end if;
    insert into bill_allocations (org_id, voucher_id, invoice_id, amount) values (p_org, v_id, a.invoice_id, a.amount);
    v_alloc_total := v_alloc_total + a.amount;
  end loop;
  if v_alloc_total > v_amount then raise exception 'allocations exceed the receipt amount'; end if;

  perform app.post_voucher(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
create or replace function public.ledger_statement(p_org uuid, p_fy uuid, p_ledger uuid, p_from date, p_to date)
returns table (entry_date date, doc_no text, source_type text, source_id uuid, narration text,
               debit bigint, credit bigint, balance bigint)
language sql stable security invoker set search_path = public as $$
  with opening as (
    select coalesce((select amount from opening_balances where fy_id = p_fy and ledger_id = p_ledger and org_id = p_org), 0)
         + coalesce((select sum(debit - credit) from ledger_entries
                     where org_id = p_org and fy_id = p_fy and ledger_id = p_ledger and entry_date < p_from), 0) as amt
  ), moves as (
    select e.id, e.entry_date, e.doc_no, e.source_type, e.source_id, e.narration, e.debit, e.credit
    from ledger_entries e
    where e.org_id = p_org and e.fy_id = p_fy and e.ledger_id = p_ledger and e.entry_date between p_from and p_to
  )
  select s.entry_date, s.doc_no, s.source_type, s.source_id, s.narration, s.debit, s.credit, s.balance
  from (
    select 0 as k, 0::bigint as id, p_from as entry_date, 'Opening balance'::text as doc_no, null::text as source_type,
           null::uuid as source_id, null::text as narration, null::bigint as debit, null::bigint as credit,
           (select amt from opening)::bigint as balance
    union all
    select 1, m.id, m.entry_date, m.doc_no, m.source_type, m.source_id, m.narration, m.debit, m.credit,
           ((select amt from opening) + sum(m.debit - m.credit) over (order by m.entry_date, m.id))::bigint
    from moves m
  ) s
  order by s.k, s.entry_date, s.id;
$$;

create or replace function public.dashboard_summary(p_org uuid, p_fy uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'sales', coalesce((select sum(case doc_kind when 'credit_note' then -total else total end)
                       from invoices where org_id = p_org and fy_id = p_fy and status = 'posted'
                         and doc_kind in ('invoice','credit_note')), 0),
    'margin', coalesce((select sum(case doc_kind when 'credit_note' then -margin else margin end)
                        from v_invoice_line_margin where org_id = p_org and doc_kind in ('invoice','credit_note')
                          and invoice_id in (select id from invoices where fy_id = p_fy)), 0),
    'receivable', coalesce((select sum(balance) from v_invoice_balance
                            where org_id = p_org and doc_kind = 'invoice' and balance > 0), 0),
    'receipts', coalesce((select sum(amount) from vouchers
                          where org_id = p_org and fy_id = p_fy and kind = 'receipt' and status = 'posted'), 0),
    'open_leads', (select count(*) from leads where org_id = p_org
                   and status not in ('booked','not_interested','fake')),
    'followups_due', (select count(*) from lead_followups f where f.org_id = p_org and f.done_at is null
                      and f.due_at < (current_date + 1)::timestamptz)
  );
$$;

-- only signed-in users may call these
revoke execute on function public.create_org(text, text, date) from public, anon;
revoke execute on function public.save_lead(uuid, jsonb) from public, anon;
revoke execute on function public.save_invoice(uuid, jsonb, jsonb, boolean) from public, anon;
revoke execute on function public.save_receipt(uuid, jsonb) from public, anon;
revoke execute on function public.ledger_statement(uuid, uuid, uuid, date, date) from public, anon;
revoke execute on function public.dashboard_summary(uuid, uuid) from public, anon;
grant execute on function public.create_org(text, text, date) to authenticated;
grant execute on function public.save_lead(uuid, jsonb) to authenticated;
grant execute on function public.save_invoice(uuid, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.save_receipt(uuid, jsonb) to authenticated;
grant execute on function public.ledger_statement(uuid, uuid, uuid, date, date) to authenticated;
grant execute on function public.dashboard_summary(uuid, uuid) to authenticated;
grant execute on all functions in schema app to authenticated;
