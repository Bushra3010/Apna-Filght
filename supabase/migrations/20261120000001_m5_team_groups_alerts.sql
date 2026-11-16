-- =====================================================================
-- Migration 0007 (Milestone 5): security hardening for team tables,
-- invitations, roles, hierarchy, lead transfer, group / fixed-departure
-- purchases, alerts, CRM dashboard, and India-time dates.
-- =====================================================================

-- ---------------------------------------------------------------------
-- India time
-- ---------------------------------------------------------------------
create or replace function app.today_ist() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

alter table leads alter column enquiry_date set default app.today_ist();
alter table quotations alter column quote_date set default app.today_ist();

-- ---------------------------------------------------------------------
-- 1. Lock down tables that control access and the books' structure.
--    Members can read them; changes go only through checked functions.
-- ---------------------------------------------------------------------
drop policy if exists member_all on roles;
drop policy if exists member_all on org_members;
drop policy if exists member_all on org_invites;
drop policy if exists member_all on financial_years;
drop policy if exists member_all on doc_series;
drop policy if exists member_all on opening_balances;

create policy read on roles for select to authenticated using (app.is_member(org_id));
create policy read on org_members for select to authenticated using (app.is_member(org_id));
create policy read on org_invites for select to authenticated using (app.can(org_id, 'users', 'edit'));
create policy read on financial_years for select to authenticated using (app.is_member(org_id));
create policy read on doc_series for select to authenticated using (app.is_member(org_id));
create policy read on opening_balances for select to authenticated using (app.is_member(org_id));
create policy write on opening_balances for all to authenticated
  using (app.can(org_id, 'accounts', 'admin')) with check (app.can(org_id, 'accounts', 'admin'));

-- year-end functions now write those tables themselves (each checks the owner permission first)
alter function public.create_next_year(uuid) security definer;
alter function public.carry_forward(uuid, uuid) security definer;
alter function public.close_year(uuid, uuid) security definer;
alter function public.reopen_year(uuid, uuid) security definer;

-- ---------------------------------------------------------------------
-- 2. Team: invitations, members, roles, hierarchy
-- ---------------------------------------------------------------------
create unique index if not exists org_invites_open_email on org_invites (org_id, lower(email)) where accepted_at is null;

/** Invite someone by email. Returns the secret token for the link (only its hash is stored). */
create or replace function public.invite_member(p_org uuid, p_email text, p_role uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not app.can(p_org, 'users', 'edit') then raise exception 'permission denied'; end if;
  if coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'enter a valid email'; end if;
  if not exists (select 1 from roles where id = p_role and org_id = p_org) then raise exception 'role not found'; end if;
  if exists (select 1 from org_members m join auth.users u on u.id = m.user_id
             where m.org_id = p_org and lower(u.email) = lower(p_email)) then
    raise exception 'that person is already in this company';
  end if;
  delete from org_invites where org_id = p_org and lower(email) = lower(p_email) and accepted_at is null;
  insert into org_invites (org_id, email, role_id, token_hash, expires_at, created_by)
  values (p_org, lower(trim(p_email)), p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
          now() + interval '7 days', auth.uid());
  return v_token;
end $$;

create or replace function public.revoke_invite(p_org uuid, p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.can(p_org, 'users', 'edit') then raise exception 'permission denied'; end if;
  delete from org_invites where id = p_invite and org_id = p_org and accepted_at is null;
end $$;

/** What an invite link points to (company and role name), for the signed-in user it was sent to. */
create or replace function public.invite_info(p_token text)
returns table (org_name text, role_name text, email text, expired boolean, accepted boolean, email_matches boolean)
language sql stable security definer set search_path = public as $$
  select o.name, r.name, i.email, i.expires_at < now(), i.accepted_at is not null,
         lower(i.email) = lower(coalesce((select u.email from auth.users u where u.id = auth.uid()), ''))
  from org_invites i join orgs o on o.id = i.org_id join roles r on r.id = i.role_id
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv org_invites;
  v_email text;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into inv from org_invites where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found then raise exception 'this invite link is not valid'; end if;
  if inv.accepted_at is not null then raise exception 'this invite has already been used'; end if;
  if inv.expires_at < now() then raise exception 'this invite has expired; ask for a new one'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> lower(inv.email) then
    raise exception 'this invite was sent to %; sign in with that email', inv.email;
  end if;
  insert into org_members (org_id, user_id, role_id, display_name)
  values (inv.org_id, auth.uid(), inv.role_id, split_part(v_email, '@', 1))
  on conflict (org_id, user_id) do update set role_id = excluded.role_id, is_active = true;
  update org_invites set accepted_at = now() where id = inv.id;
  return inv.org_id;
end $$;

/** All members who report (directly or indirectly) to p_member, plus p_member. */
create or replace function app.team_of(p_org uuid, p_member uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with recursive t(id) as (
    select p_member
    union
    select m.id from org_members m join t on m.reports_to = t.id where m.org_id = p_org
  ) select id from t;
$$;

create or replace function public.update_member(p_org uuid, p_member uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  m org_members;
  v_role uuid := nullif(p->>'role_id','')::uuid;
  v_boss uuid := nullif(p->>'reports_to','')::uuid;
  v_active boolean := coalesce((p->>'is_active')::boolean, true);
begin
  if not app.can(p_org, 'users', 'edit') then raise exception 'permission denied'; end if;
  select * into m from org_members where id = p_member and org_id = p_org for update;
  if not found then raise exception 'member not found'; end if;
  if v_role is not null and not exists (select 1 from roles where id = v_role and org_id = p_org) then
    raise exception 'role not found';
  end if;
  if v_boss is not null then
    if not exists (select 1 from org_members where id = v_boss and org_id = p_org) then raise exception 'manager not found'; end if;
    if v_boss in (select app.team_of(p_org, p_member)) then raise exception 'that would make a reporting loop'; end if;
  end if;
  -- keep at least one active owner
  if (select is_owner from roles where id = m.role_id)
     and (not v_active or not coalesce((select is_owner from roles where id = coalesce(v_role, m.role_id)), false))
     and (select count(*) from org_members x join roles r on r.id = x.role_id
          where x.org_id = p_org and x.is_active and r.is_owner and x.id <> m.id) = 0 then
    raise exception 'the company needs at least one active owner';
  end if;
  update org_members set
    role_id = coalesce(v_role, role_id), reports_to = v_boss, is_active = v_active,
    display_name = coalesce(nullif(trim(p->>'display_name'), ''), display_name),
    designation = nullif(trim(p->>'designation'), ''), mobile = nullif(trim(p->>'mobile'), '')
  where id = m.id;
end $$;

create or replace function public.save_role(p_org uuid, p_id uuid, p_name text, p_permissions jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  if not app.can(p_org, 'users', 'edit') then raise exception 'permission denied'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'enter a role name'; end if;
  if jsonb_typeof(p_permissions) <> 'object' then raise exception 'bad permissions'; end if;
  if v_id is null then
    insert into roles (org_id, name, permissions) values (p_org, trim(p_name), p_permissions) returning id into v_id;
  else
    update roles set name = trim(p_name), permissions = p_permissions
    where id = v_id and org_id = p_org and not is_owner;
    if not found then raise exception 'role not found, or it is the Owner role (which always has every permission)'; end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. Lead transfer
-- ---------------------------------------------------------------------
create or replace function public.transfer_leads(p_org uuid, p_from uuid, p_to uuid, p_statuses text[])
returns integer language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  if not app.can(p_org, 'lead', 'edit') then raise exception 'permission denied'; end if;
  if p_from = p_to then raise exception 'choose two different people'; end if;
  if not exists (select 1 from org_members where id = p_to and org_id = p_org and is_active) then
    raise exception 'choose an active team member to receive the leads';
  end if;
  update leads set assigned_to = p_to
  where org_id = p_org and assigned_to is not distinct from p_from
    and (p_statuses is null or cardinality(p_statuses) = 0 or status = any(p_statuses));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 4. Group / fixed-departure purchases
-- ---------------------------------------------------------------------
create or replace view v_group_purchase with (security_invoker = true) as
select b.id, b.org_id, b.fy_id, b.bill_no, b.bill_date, b.supplier_ledger_id, b.airline_id, b.flight_no, b.pnr,
       b.sector, b.travel_date, b.seats, b.total, b.taxable,
       coalesce(s.sold, 0)::int as sold,
       b.seats - coalesce(s.sold, 0)::int as left_seats,
       coalesce(s.revenue, 0)::bigint as revenue,
       (coalesce(s.revenue, 0) - b.taxable)::bigint as profit
from purchase_bills b
left join (
  select l.group_purchase_id,
         sum(case i.doc_kind when 'credit_note' then -1 else 1 end) as sold,
         sum(case i.doc_kind when 'credit_note' then -1 else 1 end * (l.net_sale - l.cgst - l.sgst - l.igst)) as revenue
  from invoice_lines l join invoices i on i.id = l.invoice_id
  where i.status = 'posted' and i.doc_kind in ('invoice','credit_note') and l.group_purchase_id is not null
  group by l.group_purchase_id
) s on s.group_purchase_id = b.id
where b.kind = 'group' and b.status = 'posted';

-- margin uses the group's cost per seat for seats sold from a group
create or replace view v_invoice_line_margin with (security_invoker = true) as
select l.id, l.org_id, l.invoice_id, i.invoice_no, i.invoice_date, i.bill_type, i.doc_kind,
       i.party_ledger_id, l.supplier_ledger_id, l.service,
       l.net_sale - l.cgst - l.sgst - l.igst as sale_ex_tax,
       case when g.id is not null then round(g.taxable::numeric / nullif(g.seats, 0))::bigint
            else l.purchase_gross - l.purchase_gst - l.commission end as cost_ex_tax,
       (l.net_sale - l.cgst - l.sgst - l.igst)
         - case when g.id is not null then round(g.taxable::numeric / nullif(g.seats, 0))::bigint
                else l.purchase_gross - l.purchase_gst - l.commission end as margin
from invoice_lines l join invoices i on i.id = l.invoice_id
left join purchase_bills g on g.id = l.group_purchase_id
where i.status = 'posted';

/** Buy a block of seats: one bill, posted to the flight purchase account.
    p: {supplier_ledger_id, bill_date, supplier_bill_no?, supplier_bill_date?, place_of_supply_state_id?,
        bill_type: domestic|international, airline_id?, flight_no?, pnr?, sector?, travel_date, seats,
        amount (paise, incl. any GST), gst (input GST inside amount), tds?, notes?} */
create or replace function public.save_group_purchase(p_org uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_date date := (p->>'bill_date')::date;
  v_fy uuid;
  v_supp uuid := (p->>'supplier_ledger_id')::uuid;
  v_pos uuid := nullif(p->>'place_of_supply_state_id','')::uuid;
  v_inter boolean;
  v_amount bigint := (p->>'amount')::bigint;
  v_gst bigint := coalesce((p->>'gst')::bigint, 0);
  v_seats int := (p->>'seats')::int;
  v_bt text := coalesce(nullif(p->>'bill_type',''), 'domestic');
begin
  if not app.can(p_org, 'purchase', 'create') then raise exception 'permission denied'; end if;
  if v_bt not in ('domestic','international') then raise exception 'choose domestic or international'; end if;
  if v_seats is null or v_seats < 1 then raise exception 'enter the number of seats'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'enter the amount'; end if;
  if v_gst < 0 or v_gst >= v_amount then raise exception 'input GST must be less than the amount'; end if;
  v_fy := app.fy_for_date(p_org, v_date);
  if v_fy is null then raise exception 'no open financial year for %', v_date; end if;
  perform app.assert_ledgers_in_org(p_org, array[v_supp]);
  select o.state_id is distinct from coalesce(v_pos, o.state_id) into v_inter from orgs o where o.id = p_org;

  insert into purchase_bills (org_id, fy_id, kind, bill_no, bill_date, supplier_ledger_id, supplier_bill_no,
    supplier_bill_date, place_of_supply_state_id, airline_id, flight_no, pnr, sector, travel_date, seats, tds, notes, created_by)
  values (p_org, v_fy, 'group', app.next_doc_no(p_org, v_fy, 'purchase_group'), v_date, v_supp,
    nullif(p->>'supplier_bill_no',''), nullif(p->>'supplier_bill_date','')::date, v_pos,
    nullif(p->>'airline_id','')::uuid, nullif(upper(p->>'flight_no'),''), nullif(upper(p->>'pnr'),''),
    nullif(upper(p->>'sector'),''), nullif(p->>'travel_date','')::date, v_seats,
    coalesce((p->>'tds')::bigint, 0), nullif(p->>'notes',''), app.member_id(p_org))
  returning id into v_id;

  insert into purchase_bill_lines (org_id, purchase_bill_id, ledger_id, description, taxable, gst_rate, cgst, sgst, igst, amount)
  values (p_org, v_id, app.sys_ledger(p_org, 'purchase_' || v_bt),
    format('%s seats %s %s', v_seats, coalesce(upper(p->>'sector'), ''), coalesce(upper(p->>'pnr'), '')),
    v_amount - v_gst, 0,
    case when v_inter then 0 else v_gst / 2 end, case when v_inter then 0 else v_gst - v_gst / 2 end,
    case when v_inter then v_gst else 0 end, v_amount);

  perform app.post_purchase_bill(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 5. Invoices: as in 0004, plus seats sold from a group purchase
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
    purchase_gross, purchase_gst, commission, tds, net_purchase, group_purchase_id)
  select p_org, v_id, (r.ordinality - 1)::smallint, r.service, r.description, r.passenger_id, r.pax_name, r.pax_type,
    r.airline_id, r.flight_no, r.pnr, r.ticket_no, r.sector, r.travel_date, r.return_date, coalesce(r.details, '{}'),
    coalesce(r.basic,0), coalesce(r.xt,0), coalesce(r.service_fee,0), coalesce(r.other_charges,0),
    coalesce(r.discount,0), coalesce(r.taxable,0), coalesce(r.gst_rate,0),
    coalesce(r.cgst,0), coalesce(r.sgst,0), coalesce(r.igst,0), coalesce(r.net_sale,0),
    r.supplier_ledger_id, r.supplier_invoice_no, r.supplier_invoice_date,
    coalesce(r.purchase_gross,0), coalesce(r.purchase_gst,0), coalesce(r.commission,0),
    coalesce(r.tds,0), coalesce(r.net_purchase,0), r.group_purchase_id
  from jsonb_populate_recordset(null::invoice_lines, p_lines) with ordinality as r;

  if exists (select 1 from invoice_lines l where l.invoice_id = v_id and l.passenger_id is not null
             and not exists (select 1 from passengers p where p.id = l.passenger_id and p.org_id = p_org)) then
    raise exception 'passenger does not belong to this company';
  end if;

  -- seats sold from a group / fixed-departure purchase
  if exists (select 1 from invoice_lines l where l.invoice_id = v_id and l.group_purchase_id is not null) then
    if exists (select 1 from invoice_lines l where l.invoice_id = v_id and l.group_purchase_id is not null
               and not exists (select 1 from purchase_bills b where b.id = l.group_purchase_id and b.org_id = p_org
                               and b.kind = 'group' and b.status = 'posted')) then
      raise exception 'group purchase not found';
    end if;
    if exists (select 1 from invoice_lines l where l.invoice_id = v_id and l.group_purchase_id is not null
               and (l.supplier_ledger_id is not null or l.purchase_gross <> 0)) then
      raise exception 'seats from a group are already paid for; leave the purchase side empty';
    end if;
    -- seats already sold on other documents + seats on this one (an edit must not count itself twice)
    if v_kind = 'invoice' and exists (
        select 1 from purchase_bills b
        where b.id in (select group_purchase_id from invoice_lines where invoice_id = v_id)
          and (select coalesce(sum(case i.doc_kind when 'credit_note' then -1 else 1 end), 0)
               from invoice_lines x join invoices i on i.id = x.invoice_id
               where x.group_purchase_id = b.id and i.status = 'posted' and i.doc_kind in ('invoice','credit_note') and i.id <> v_id)
            + (select count(*) from invoice_lines x where x.invoice_id = v_id and x.group_purchase_id = b.id) > b.seats) then
      raise exception 'not enough seats left in that group';
    end if;
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
-- 6. Alerts
-- ---------------------------------------------------------------------
create or replace function public.alerts(p_org uuid, p_fy uuid)
returns table (kind text, doc_id uuid, doc_no text, doc_date date, party text, detail text, amount bigint)
language sql stable security invoker set search_path = public as $$
  -- registered client whose GSTIN state differs from the place of supply
  select 'invalid_gst', i.id, i.invoice_no, i.invoice_date, p.name,
         format('GSTIN %s is for state %s but place of supply is %s', p.gstin, left(p.gstin, 2), s.gst_code), i.total
  from invoices i join ledgers p on p.id = i.party_ledger_id left join states s on s.id = i.place_of_supply_state_id
  where i.org_id = p_org and i.fy_id = p_fy and i.status = 'posted' and i.doc_kind = 'invoice'
    and p.gstin is not null and s.gst_code is not null and left(p.gstin, 2) <> s.gst_code
  union all
  -- sold below cost
  select 'loss', i.id, i.invoice_no, i.invoice_date, p.name, 'Margin is negative', m.margin
  from (select invoice_id, sum(margin)::bigint margin from v_invoice_line_margin where org_id = p_org group by invoice_id) m
  join invoices i on i.id = m.invoice_id join ledgers p on p.id = i.party_ledger_id
  where i.fy_id = p_fy and m.margin < 0 and i.doc_kind = 'invoice'
  union all
  -- credit notes where you gave back more than you recovered
  select 'loss_cn', i.id, i.invoice_no, i.invoice_date, p.name, 'Refund exceeds what was recovered from the supplier', -m.margin
  from (select invoice_id, sum(margin)::bigint margin from v_invoice_line_margin where org_id = p_org group by invoice_id) m
  join invoices i on i.id = m.invoice_id join ledgers p on p.id = i.party_ledger_id
  where i.fy_id = p_fy and i.doc_kind = 'credit_note' and m.margin > 0
  union all
  -- ticket / hotel / visa sales with no purchase recorded
  select 'pending_purchase', i.id, i.invoice_no, i.invoice_date, p.name,
         format('%s line(s) have no supplier cost', count(*)), sum(l.net_sale)::bigint
  from invoices i join invoice_lines l on l.invoice_id = i.id join ledgers p on p.id = i.party_ledger_id
  where i.org_id = p_org and i.fy_id = p_fy and i.status = 'posted' and i.doc_kind = 'invoice'
    and l.service in ('flight','hotel','visa','insurance','train','bus','taxi','tour')
    and l.supplier_ledger_id is null and l.group_purchase_id is null and l.basic > 0
  group by i.id, p.name
  union all
  -- supplier invoice dated in a different month than the sale
  select 'date_mismatch', i.id, i.invoice_no, i.invoice_date, p.name,
         format('Supplier invoice dated %s', to_char(min(l.supplier_invoice_date), 'DD Mon YYYY')), null::bigint
  from invoices i join invoice_lines l on l.invoice_id = i.id join ledgers p on p.id = i.party_ledger_id
  where i.org_id = p_org and i.fy_id = p_fy and i.status = 'posted' and i.doc_kind = 'invoice'
    and l.supplier_invoice_date is not null and date_trunc('month', l.supplier_invoice_date) <> date_trunc('month', i.invoice_date)
  group by i.id, p.name
  union all
  -- proformas not invoiced after a week
  select 'stale_proforma', i.id, i.invoice_no, i.invoice_date, p.name, format('Open for %s days', app.today_ist() - i.invoice_date), i.total
  from invoices i join ledgers p on p.id = i.party_ledger_id
  where i.org_id = p_org and i.doc_kind = 'proforma' and i.converted_to_invoice_id is null and i.invoice_date < app.today_ist() - 7
  union all
  -- follow-ups past due
  select 'overdue_followup', l.id, l.lead_no, (f.due_at at time zone 'Asia/Kolkata')::date, l.guest_name,
         format('%s overdue since %s', replace(f.action, '_', ' '), to_char(f.due_at at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM')), null::bigint
  from lead_followups f join leads l on l.id = f.lead_id
  where f.org_id = p_org and f.done_at is null and f.due_at < now()
    and l.status not in ('booked','not_interested','fake');
$$;

-- ---------------------------------------------------------------------
-- 7. CRM dashboard (scope: 'self', 'team' or 'all')
-- ---------------------------------------------------------------------
create or replace function public.crm_dashboard(p_org uuid, p_fy uuid, p_scope text)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_me uuid := app.member_id(p_org);
  v_ids uuid[];
  r jsonb;
begin
  if v_me is null then raise exception 'not a member'; end if;
  v_ids := case p_scope
             when 'self' then array[v_me]
             when 'team' then array(select app.team_of(p_org, v_me))
             else null end;
  with l as (
    select * from leads where org_id = p_org and (v_ids is null or assigned_to = any(v_ids))
  ), open_l as (
    select * from l where status in ('initial','active','proposal','negotiation','pipeline')
  ), quote as (
    select q.lead_id, max(q.grand_total) v from quotations q where q.org_id = p_org and q.lead_id in (select id from open_l) group by q.lead_id
  ), trips as (
    select distinct i.id, min(li.travel_date) start_d, max(coalesce(li.return_date, li.travel_date)) end_d
    from invoices i join invoice_lines li on li.invoice_id = i.id
    left join leads ld on ld.id = i.lead_id
    where i.org_id = p_org and i.status = 'posted' and i.doc_kind = 'invoice' and li.travel_date is not null
      and (v_ids is null or ld.assigned_to = any(v_ids))
    group by i.id
  )
  select jsonb_build_object(
    'funnel', (select jsonb_object_agg(s, coalesce(n, 0)) from unnest(array['initial','active','proposal','negotiation','pipeline','booked','not_interested','fake']) s
               left join (select status, count(*) n from l group by status) c on c.status = s),
    'live', (select count(*) from open_l),
    'followups_left', (select count(*) from lead_followups f join open_l on open_l.id = f.lead_id where f.done_at is null and f.due_at < now()),
    'followups_today', (select count(*) from lead_followups f join open_l on open_l.id = f.lead_id where f.done_at is null
                          and (f.due_at at time zone 'Asia/Kolkata')::date = app.today_ist()),
    'pendency', jsonb_build_object(
        'd3_7', (select count(*) from open_l where app.today_ist() - greatest(open_l.enquiry_date, (coalesce(open_l.last_followup_at, open_l.created_at) at time zone 'Asia/Kolkata')::date) between 3 and 7),
        'd8_15', (select count(*) from open_l where app.today_ist() - greatest(open_l.enquiry_date, (coalesce(open_l.last_followup_at, open_l.created_at) at time zone 'Asia/Kolkata')::date) between 8 and 15),
        'd16_30', (select count(*) from open_l where app.today_ist() - greatest(open_l.enquiry_date, (coalesce(open_l.last_followup_at, open_l.created_at) at time zone 'Asia/Kolkata')::date) between 16 and 30),
        'd30_plus', (select count(*) from open_l where app.today_ist() - greatest(open_l.enquiry_date, (coalesce(open_l.last_followup_at, open_l.created_at) at time zone 'Asia/Kolkata')::date) > 30)),
    'proposals', jsonb_build_object(
        'lt1', (select count(*) from quote where v < 10000000), 'l1_3', (select count(*) from quote where v >= 10000000 and v < 30000000),
        'l3_5', (select count(*) from quote where v >= 30000000 and v < 50000000), 'gt5', (select count(*) from quote where v >= 50000000),
        'value', coalesce((select sum(v) from quote), 0)),
    'trips', jsonb_build_object(
        'running', (select count(*) from trips where start_d <= app.today_ist() and end_d >= app.today_ist()),
        'upcoming', (select count(*) from trips where start_d > app.today_ist() and start_d <= app.today_ist() + 30)),
    'people', coalesce((select jsonb_agg(x order by x->>'sales' desc) from (
        select jsonb_build_object(
          'member', m.display_name,
          'leads', (select count(*) from leads where org_id = p_org and assigned_to = m.id),
          'open', (select count(*) from leads where org_id = p_org and assigned_to = m.id and status in ('initial','active','proposal','negotiation','pipeline')),
          'booked', (select count(*) from leads where org_id = p_org and assigned_to = m.id and status = 'booked'),
          'sales', coalesce((select sum(case i.doc_kind when 'credit_note' then -i.total else i.total end) from invoices i
                             join leads ld on ld.id = coalesce(i.lead_id, (select lead_id from invoices r where r.id = i.ref_invoice_id))
                             where i.org_id = p_org and i.fy_id = p_fy and i.status = 'posted' and ld.assigned_to = m.id), 0)) x
        from org_members m where m.org_id = p_org and m.is_active and (v_ids is null or m.id = any(v_ids))) t), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 8. India time in the dashboard figures
-- ---------------------------------------------------------------------
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
                      and (f.due_at at time zone 'Asia/Kolkata')::date <= app.today_ist())
  );
$$;

create or replace function public.receivable_ageing(p_org uuid)
returns table (bucket text, sort int, amount bigint, invoices bigint)
language sql stable security invoker set search_path = public as $$
  with b as (
    select balance, app.today_ist() - coalesce(due_date, invoice_date) as age
    from v_invoice_balance where org_id = p_org and balance > 0
  ), buckets(bucket, sort, lo, hi) as (values
    ('Not due', 0, -100000, 0), ('1–7 days', 1, 1, 7), ('8–15 days', 2, 8, 15),
    ('16–30 days', 3, 16, 30), ('31–60 days', 4, 31, 60), ('Over 60 days', 5, 61, 100000))
  select k.bucket, k.sort, coalesce(sum(b.balance), 0)::bigint, count(b.balance)
  from buckets k left join b on b.age between k.lo and k.hi
  group by k.bucket, k.sort order by k.sort;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'invite_member(uuid, text, uuid)', 'revoke_invite(uuid, uuid)', 'invite_info(text)', 'accept_invite(text)',
    'update_member(uuid, uuid, jsonb)', 'save_role(uuid, uuid, text, jsonb)', 'transfer_leads(uuid, uuid, uuid, text[])',
    'save_group_purchase(uuid, jsonb)', 'alerts(uuid, uuid)', 'crm_dashboard(uuid, uuid, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on all functions in schema app to authenticated;
grant select on v_group_purchase, v_invoice_line_margin to authenticated;
