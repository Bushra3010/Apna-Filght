-- =====================================================================
-- Migration 0005 (Milestone 3): itineraries, quotations, proforma
-- conversion and hotel vouchers.
-- =====================================================================

alter table quotations add column if not exists gst_rate numeric(5,2) not null default 5
  check (gst_rate between 0 and 28);
alter table quotations add column if not exists subtotal bigint not null default 0;
alter table quotations add column if not exists valid_until date;

-- proforma -> the invoice it became
alter table invoices add column if not exists converted_to_invoice_id uuid references invoices(id) on delete set null;
create index if not exists invoices_converted_to_invoice_id_idx on invoices (converted_to_invoice_id);

-- ---------------------------------------------------------------------
-- Every id a document references must belong to the same company.
-- Table names are whitelisted; ids are bound parameters.
-- ---------------------------------------------------------------------
create or replace function app.assert_in_org(p_org uuid, p_table text, p_ids uuid[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_bad int;
begin
  if p_table not in ('ledgers','lookups','leads','itineraries','routes','hotels','hotel_rates',
                     'activity_rates','vehicles','quotations','invoices','passengers') then
    raise exception 'unknown table %', p_table;
  end if;
  execute format(
    'select count(*) from unnest($1) as x(id) where x.id is not null
       and not exists (select 1 from %I t where t.id = x.id and t.org_id = $2)', p_table)
    into v_bad using p_ids, p_org;
  if v_bad > 0 then raise exception '% reference does not belong to this company', p_table; end if;
end $$;

-- ---------------------------------------------------------------------
-- Itineraries: header + day-wise plan in one transaction
--   p: {id?, title, route_id?, package_title_id?, nights, overview?}
--   p_days: [{day_no, city_id?, title, description?}]
-- ---------------------------------------------------------------------
create or replace function public.save_itinerary(p_org uuid, p jsonb, p_days jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid := nullif(p->>'id','')::uuid;
begin
  if not app.can(p_org, 'quotation', case when v_id is null then 'create' else 'edit' end) then
    raise exception 'permission denied';
  end if;
  perform app.assert_in_org(p_org, 'routes', array[nullif(p->>'route_id','')::uuid]);
  perform app.assert_in_org(p_org, 'lookups', array[nullif(p->>'package_title_id','')::uuid]);

  if v_id is null then
    insert into itineraries (org_id, title, route_id, package_title_id, nights, overview)
    values (p_org, p->>'title', nullif(p->>'route_id','')::uuid, nullif(p->>'package_title_id','')::uuid,
            coalesce((p->>'nights')::smallint, 0), nullif(p->>'overview',''))
    returning id into v_id;
  else
    update itineraries set title = p->>'title', route_id = nullif(p->>'route_id','')::uuid,
      package_title_id = nullif(p->>'package_title_id','')::uuid,
      nights = coalesce((p->>'nights')::smallint, 0), overview = nullif(p->>'overview','')
    where id = v_id and org_id = p_org;
    if not found then raise exception 'itinerary not found'; end if;
    delete from itinerary_days where itinerary_id = v_id;
  end if;

  insert into itinerary_days (org_id, itinerary_id, day_no, city_id, title, description)
  select p_org, v_id, (x.ordinality)::smallint, nullif(x.value->>'city_id','')::uuid,
         x.value->>'title', nullif(x.value->>'description','')
  from jsonb_array_elements(coalesce(p_days, '[]')) with ordinality as x;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Quotations: header + items; totals computed here.
--   p: {id?, quote_date, lead_id?, party_ledger_id?, client_name, itinerary_id?, route_id?,
--       package_title_id?, meal_plan_id?, start_date?, nights?, adults, children, infants,
--       gst_rate, status?, valid_until?, inclusions?, exclusions?, terms?}
--   p_items: [{kind, day_no?, description, hotel_rate_id?, activity_rate_id?, vehicle_id?,
--              qty, unit_cost, unit_price}]   (paise)
-- GST is on the selling total (tour operator: 5% on full value, or 18%).
-- ---------------------------------------------------------------------
create or replace function public.save_quotation(p_org uuid, p jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id','')::uuid;
  v_date date := coalesce(nullif(p->>'quote_date','')::date, current_date);
  v_fy uuid;
  v_rate numeric := coalesce((p->>'gst_rate')::numeric, 5);
  v_cost bigint; v_sub bigint; v_tax bigint;
begin
  if not app.can(p_org, 'quotation', case when v_id is null then 'create' else 'edit' end) then
    raise exception 'permission denied';
  end if;
  if coalesce(trim(p->>'client_name'),'') = '' then raise exception 'enter the client name'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'a quotation needs at least one item'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) x
             where coalesce((x->>'qty')::numeric, 0) <= 0
                or coalesce((x->>'unit_price')::bigint, 0) < 0 or coalesce((x->>'unit_cost')::bigint, 0) < 0) then
    raise exception 'item quantities must be positive and prices zero or more';
  end if;
  v_fy := app.fy_for_date(p_org, v_date);
  if v_fy is null then raise exception 'no open financial year for %', v_date; end if;

  perform app.assert_ledgers_in_org(p_org, array[nullif(p->>'party_ledger_id','')::uuid]);
  perform app.assert_in_org(p_org, 'leads', array[nullif(p->>'lead_id','')::uuid]);
  perform app.assert_in_org(p_org, 'itineraries', array[nullif(p->>'itinerary_id','')::uuid]);
  perform app.assert_in_org(p_org, 'routes', array[nullif(p->>'route_id','')::uuid]);
  perform app.assert_in_org(p_org, 'lookups', array[nullif(p->>'package_title_id','')::uuid, nullif(p->>'meal_plan_id','')::uuid]);
  perform app.assert_in_org(p_org, 'hotel_rates', array(select nullif(x->>'hotel_rate_id','')::uuid from jsonb_array_elements(p_items) x));
  perform app.assert_in_org(p_org, 'activity_rates', array(select nullif(x->>'activity_rate_id','')::uuid from jsonb_array_elements(p_items) x));
  perform app.assert_in_org(p_org, 'vehicles', array(select nullif(x->>'vehicle_id','')::uuid from jsonb_array_elements(p_items) x));

  if v_id is null then
    insert into quotations (org_id, fy_id, quote_no, quote_date, lead_id, party_ledger_id, client_name, itinerary_id,
      route_id, package_title_id, meal_plan_id, start_date, nights, adults, children, infants, gst_rate,
      status, valid_until, inclusions, exclusions, terms, created_by)
    values (p_org, v_fy, app.next_doc_no(p_org, v_fy, 'quotation'), v_date, nullif(p->>'lead_id','')::uuid,
      nullif(p->>'party_ledger_id','')::uuid, trim(p->>'client_name'), nullif(p->>'itinerary_id','')::uuid,
      nullif(p->>'route_id','')::uuid, nullif(p->>'package_title_id','')::uuid, nullif(p->>'meal_plan_id','')::uuid,
      nullif(p->>'start_date','')::date, nullif(p->>'nights','')::smallint,
      coalesce((p->>'adults')::smallint, 1), coalesce((p->>'children')::smallint, 0), coalesce((p->>'infants')::smallint, 0),
      v_rate, coalesce(nullif(p->>'status',''), 'draft'), nullif(p->>'valid_until','')::date,
      nullif(p->>'inclusions',''), nullif(p->>'exclusions',''), nullif(p->>'terms',''), app.member_id(p_org))
    returning id into v_id;
  else
    update quotations set quote_date = v_date, lead_id = nullif(p->>'lead_id','')::uuid,
      party_ledger_id = nullif(p->>'party_ledger_id','')::uuid, client_name = trim(p->>'client_name'),
      itinerary_id = nullif(p->>'itinerary_id','')::uuid, route_id = nullif(p->>'route_id','')::uuid,
      package_title_id = nullif(p->>'package_title_id','')::uuid, meal_plan_id = nullif(p->>'meal_plan_id','')::uuid,
      start_date = nullif(p->>'start_date','')::date, nights = nullif(p->>'nights','')::smallint,
      adults = coalesce((p->>'adults')::smallint, 1), children = coalesce((p->>'children')::smallint, 0),
      infants = coalesce((p->>'infants')::smallint, 0), gst_rate = v_rate,
      status = coalesce(nullif(p->>'status',''), status), valid_until = nullif(p->>'valid_until','')::date,
      inclusions = nullif(p->>'inclusions',''), exclusions = nullif(p->>'exclusions',''), terms = nullif(p->>'terms','')
    where id = v_id and org_id = p_org;
    if not found then raise exception 'quotation not found'; end if;
    delete from quotation_items where quotation_id = v_id;
  end if;

  insert into quotation_items (org_id, quotation_id, sort, kind, day_no, description, hotel_rate_id,
    activity_rate_id, vehicle_id, qty, unit_cost, unit_price, amount)
  select p_org, v_id, (x.ordinality - 1)::smallint, x.value->>'kind', nullif(x.value->>'day_no','')::smallint,
         x.value->>'description', nullif(x.value->>'hotel_rate_id','')::uuid, nullif(x.value->>'activity_rate_id','')::uuid,
         nullif(x.value->>'vehicle_id','')::uuid, (x.value->>'qty')::numeric,
         coalesce((x.value->>'unit_cost')::bigint, 0), coalesce((x.value->>'unit_price')::bigint, 0),
         round((x.value->>'qty')::numeric * coalesce((x.value->>'unit_price')::bigint, 0))::bigint
  from jsonb_array_elements(p_items) with ordinality as x;

  select coalesce(sum(round(qty * unit_cost)),0)::bigint, coalesce(sum(amount),0)::bigint
    into v_cost, v_sub from quotation_items where quotation_id = v_id;
  v_tax := round(v_sub * v_rate / 100)::bigint;
  update quotations set cost_total = v_cost, subtotal = v_sub, markup = v_sub - v_cost,
    tax_total = v_tax, grand_total = v_sub + v_tax
  where id = v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Hotel / cruise vouchers
-- ---------------------------------------------------------------------
create or replace function public.save_hotel_voucher(p_org uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id','')::uuid;
  v_date date := coalesce(nullif(p->>'voucher_date','')::date, current_date);
  v_fy uuid;
begin
  if not app.can(p_org, 'invoice', case when v_id is null then 'create' else 'edit' end) then
    raise exception 'permission denied';
  end if;
  v_fy := app.fy_for_date(p_org, v_date);
  if v_fy is null then raise exception 'no open financial year for %', v_date; end if;
  perform app.assert_ledgers_in_org(p_org, array[nullif(p->>'party_ledger_id','')::uuid]);
  perform app.assert_in_org(p_org, 'invoices', array[nullif(p->>'invoice_id','')::uuid]);
  perform app.assert_in_org(p_org, 'hotels', array[nullif(p->>'hotel_id','')::uuid]);

  if v_id is null then
    insert into hotel_vouchers (org_id, fy_id, voucher_no, voucher_date, kind, party_ledger_id, invoice_id, hotel_id,
      property_name, guest_name, guests, adults, children, check_in, check_out, rooms, room_type, meal_plan,
      confirmation_no, contact, inclusions, notes)
    values (p_org, v_fy, app.next_doc_no(p_org, v_fy, 'hotel_voucher'), v_date, coalesce(nullif(p->>'kind',''), 'hotel'),
      nullif(p->>'party_ledger_id','')::uuid, nullif(p->>'invoice_id','')::uuid, nullif(p->>'hotel_id','')::uuid,
      p->>'property_name', p->>'guest_name', coalesce(p->'guests', '[]'),
      coalesce((p->>'adults')::smallint, 1), coalesce((p->>'children')::smallint, 0),
      (p->>'check_in')::date, (p->>'check_out')::date, coalesce((p->>'rooms')::smallint, 1),
      nullif(p->>'room_type',''), nullif(p->>'meal_plan',''), nullif(p->>'confirmation_no',''),
      nullif(p->>'contact',''), nullif(p->>'inclusions',''), nullif(p->>'notes',''))
    returning id into v_id;
  else
    update hotel_vouchers set voucher_date = v_date, kind = coalesce(nullif(p->>'kind',''), 'hotel'),
      party_ledger_id = nullif(p->>'party_ledger_id','')::uuid, invoice_id = nullif(p->>'invoice_id','')::uuid,
      hotel_id = nullif(p->>'hotel_id','')::uuid, property_name = p->>'property_name', guest_name = p->>'guest_name',
      guests = coalesce(p->'guests', '[]'), adults = coalesce((p->>'adults')::smallint, 1),
      children = coalesce((p->>'children')::smallint, 0), check_in = (p->>'check_in')::date,
      check_out = (p->>'check_out')::date, rooms = coalesce((p->>'rooms')::smallint, 1),
      room_type = nullif(p->>'room_type',''), meal_plan = nullif(p->>'meal_plan',''),
      confirmation_no = nullif(p->>'confirmation_no',''), contact = nullif(p->>'contact',''),
      inclusions = nullif(p->>'inclusions',''), notes = nullif(p->>'notes','')
    where id = v_id and org_id = p_org;
    if not found then raise exception 'voucher not found'; end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Proforma -> invoice: copies header and lines, posts, links them.
-- ---------------------------------------------------------------------
create or replace function public.convert_proforma(p_org uuid, p_proforma uuid, p_date date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  pf invoices;
  v_header jsonb;
  v_lines jsonb;
  v_inv uuid;
begin
  select * into pf from invoices where id = p_proforma and org_id = p_org and doc_kind = 'proforma' for update;
  if not found then raise exception 'proforma not found'; end if;
  if pf.converted_to_invoice_id is not null then raise exception 'this proforma is already invoiced'; end if;

  v_header := jsonb_build_object(
    'bill_type', pf.bill_type, 'invoice_date', coalesce(p_date, current_date), 'due_date', pf.due_date,
    'party_ledger_id', pf.party_ledger_id, 'booked_by_id', pf.booked_by_id, 'contact_phone', pf.contact_phone,
    'place_of_supply_state_id', pf.place_of_supply_state_id, 'lead_id', pf.lead_id, 'notes', pf.notes);
  select coalesce(jsonb_agg(to_jsonb(l) - 'id' - 'invoice_id' - 'org_id' - 'created_at' - 'updated_at' order by l.sort), '[]')
    into v_lines from invoice_lines l where l.invoice_id = pf.id;

  v_inv := public.save_invoice(p_org, v_header, v_lines, true);
  update invoices set quotation_id = pf.quotation_id where id = v_inv;
  update invoices set converted_to_invoice_id = v_inv where id = pf.id;
  return v_inv;
end $$;

revoke execute on function public.save_itinerary(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.save_quotation(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.save_hotel_voucher(uuid, jsonb) from public, anon;
revoke execute on function public.convert_proforma(uuid, uuid, date) from public, anon;
grant execute on function public.save_itinerary(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_quotation(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_hotel_voucher(uuid, jsonb) to authenticated;
grant execute on function public.convert_proforma(uuid, uuid, date) to authenticated;
grant execute on all functions in schema app to authenticated;
