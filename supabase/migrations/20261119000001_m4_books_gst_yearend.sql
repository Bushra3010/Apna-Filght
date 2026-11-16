-- =====================================================================
-- Migration 0006 (Milestone 4): trial balance, GST return data,
-- outstanding, bill adjustment after the fact, and year-end.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Trial balance rows with the account tree (top-level group = 2 levels max)
-- ---------------------------------------------------------------------
create or replace function public.trial_balance(p_org uuid, p_fy uuid, p_from date, p_to date)
returns table (ledger_id uuid, ledger_name text, ledger_kind text, group_id uuid, group_name text,
               top_group_id uuid, top_group_name text, top_group_key text, nature text, top_sort smallint,
               opening bigint, debit bigint, credit bigint, closing bigint)
language sql stable security invoker set search_path = public as $$
  select l.id, l.name, l.kind, g.id, g.name, coalesce(p.id, g.id), coalesce(p.name, g.name),
         coalesce(p.system_key, g.system_key), g.nature,
         coalesce(p.sort, g.sort), b.opening, b.debit, b.credit, b.closing
  from app.ledger_balances(p_org, p_fy, p_from, p_to) b
  join ledgers l on l.id = b.ledger_id
  join account_groups g on g.id = l.group_id
  left join account_groups p on p.id = g.parent_id
  order by coalesce(p.sort, g.sort), coalesce(p.name, g.name), g.name, l.name;
$$;

-- ---------------------------------------------------------------------
-- GST: outward supplies per document per rate (invoices and credit notes)
-- Amounts are as stored: credit notes positive; the report subtracts them.
-- ---------------------------------------------------------------------
create or replace function public.gst_sales_lines(p_org uuid, p_from date, p_to date)
returns table (invoice_id uuid, doc_kind text, bill_type text, invoice_no text, invoice_date date, total bigint,
               party_name text, party_gstin text, pos_code text, is_interstate boolean,
               ref_no text, ref_date date, ref_total bigint,
               gst_rate numeric, taxable bigint, igst bigint, cgst bigint, sgst bigint, exempt bigint)
language sql stable security invoker set search_path = public as $$
  select i.id, i.doc_kind, i.bill_type, i.invoice_no, i.invoice_date, i.total,
         p.name, p.gstin, coalesce(s.gst_code, os.gst_code), i.is_interstate,
         r.invoice_no, r.invoice_date, r.total,
         l.gst_rate, sum(l.taxable)::bigint, sum(l.igst)::bigint, sum(l.cgst)::bigint, sum(l.sgst)::bigint,
         sum(case when i.bill_type = 'bill_of_supply' then l.net_sale else 0 end)::bigint
  from invoices i
  join invoice_lines l on l.invoice_id = i.id
  join ledgers p on p.id = i.party_ledger_id
  join orgs o on o.id = i.org_id
  left join states s on s.id = i.place_of_supply_state_id
  left join states os on os.id = o.state_id
  left join invoices r on r.id = i.ref_invoice_id
  where i.org_id = p_org and i.status = 'posted' and i.doc_kind in ('invoice','credit_note')
    and i.invoice_date between p_from and p_to
  group by i.id, p.name, p.gstin, s.gst_code, os.gst_code, r.invoice_no, r.invoice_date, r.total, l.gst_rate
  order by i.invoice_date, i.invoice_no, l.gst_rate;
$$;

-- per service (mapped to SAC in the app), rate and B2B/B2C, for the HSN/SAC summary
create or replace function public.gst_hsn_lines(p_org uuid, p_from date, p_to date)
returns table (service text, registered boolean, gst_rate numeric, doc_kind text,
               total bigint, taxable bigint, igst bigint, cgst bigint, sgst bigint)
language sql stable security invoker set search_path = public as $$
  select case when l.service = 'cancellation_charge' then i.bill_type else l.service end,
         p.gstin is not null, l.gst_rate, i.doc_kind,
         sum(l.net_sale)::bigint, sum(l.taxable)::bigint, sum(l.igst)::bigint, sum(l.cgst)::bigint, sum(l.sgst)::bigint
  from invoices i
  join invoice_lines l on l.invoice_id = i.id
  join ledgers p on p.id = i.party_ledger_id
  where i.org_id = p_org and i.status = 'posted' and i.doc_kind in ('invoice','credit_note')
    and i.bill_type <> 'bill_of_supply' and i.invoice_date between p_from and p_to
  group by 1, 2, 3, 4;
$$;

-- inward supplies with input tax: purchase bills + supplier side of invoice lines
create or replace function public.gst_purchase_lines(p_org uuid, p_from date, p_to date)
returns table (source text, doc_id uuid, doc_no text, doc_date date, supplier_id uuid, supplier_name text,
               supplier_gstin text, supplier_bill_no text, taxable bigint, gst_rate numeric,
               igst bigint, cgst bigint, sgst bigint, tds bigint, commission bigint, total bigint)
language sql stable security invoker set search_path = public as $$
  select 'purchase_bill', b.id, b.bill_no, b.bill_date, s.id, s.name, s.gstin, b.supplier_bill_no,
         sum(pl.taxable)::bigint, pl.gst_rate, sum(pl.igst)::bigint, sum(pl.cgst)::bigint, sum(pl.sgst)::bigint,
         max(b.tds), 0::bigint, sum(pl.amount)::bigint
  from purchase_bills b
  join purchase_bill_lines pl on pl.purchase_bill_id = b.id
  join ledgers s on s.id = b.supplier_ledger_id
  where b.org_id = p_org and b.status = 'posted' and b.bill_date between p_from and p_to
  group by b.id, s.id, pl.gst_rate
  union all
  -- ticket purchases: input GST is recorded as one amount; split by supplier state
  select 'invoice', i.id, i.invoice_no, i.invoice_date, s.id, s.name, s.gstin,
         string_agg(distinct l.supplier_invoice_no, ', '),
         sum(case i.doc_kind when 'credit_note' then -(l.purchase_gross - l.purchase_gst) else l.purchase_gross - l.purchase_gst end)::bigint,
         null::numeric,
         sum(case when s.state_id is distinct from o.state_id then (case i.doc_kind when 'credit_note' then -l.purchase_gst else l.purchase_gst end) else 0 end)::bigint,
         sum(case when s.state_id is not distinct from o.state_id then (case i.doc_kind when 'credit_note' then -l.purchase_gst else l.purchase_gst end) / 2 else 0 end)::bigint,
         sum(case when s.state_id is not distinct from o.state_id then (case i.doc_kind when 'credit_note' then -l.purchase_gst else l.purchase_gst end)
                   - (case i.doc_kind when 'credit_note' then -l.purchase_gst else l.purchase_gst end) / 2 else 0 end)::bigint,
         sum(case i.doc_kind when 'credit_note' then -l.tds else l.tds end)::bigint,
         sum(case i.doc_kind when 'credit_note' then -l.commission else l.commission end)::bigint,
         sum(case i.doc_kind when 'credit_note' then -l.net_purchase else l.net_purchase end)::bigint
  from invoices i
  join invoice_lines l on l.invoice_id = i.id and l.supplier_ledger_id is not null
  join ledgers s on s.id = l.supplier_ledger_id
  join orgs o on o.id = i.org_id
  where i.org_id = p_org and i.status = 'posted' and i.doc_kind in ('invoice','credit_note')
    and i.invoice_date between p_from and p_to
  group by i.id, s.id
  order by 4, 3;
$$;

-- ---------------------------------------------------------------------
-- Outstanding by party: ledger balance as on a date + open bills by age
-- ---------------------------------------------------------------------
create or replace function public.party_outstanding(p_org uuid, p_fy uuid, p_as_of date, p_kind text)
returns table (ledger_id uuid, ledger_name text, mobile text, credit_days smallint, balance bigint,
               not_due bigint, d1_30 bigint, d31_60 bigint, d61_90 bigint, d90_plus bigint, open_bills bigint)
language sql stable security invoker set search_path = public as $$
  with fy as (select starts_on from financial_years where id = p_fy and org_id = p_org),
  bal as (
    select b.ledger_id, b.closing from app.ledger_balances(p_org, p_fy, (select starts_on from fy), p_as_of) b
  ),
  bills as (
    select party_ledger_id as ledger_id, balance, p_as_of - coalesce(due_date, invoice_date) as age
    from v_invoice_balance where org_id = p_org and balance > 0 and p_kind = 'customer'
    union all
    select supplier_ledger_id, balance, p_as_of - bill_date
    from v_purchase_balance where org_id = p_org and balance > 0 and p_kind = 'supplier'
  ),
  aged as (
    select ledger_id,
      sum(balance) filter (where age <= 0) nd, sum(balance) filter (where age between 1 and 30) a,
      sum(balance) filter (where age between 31 and 60) b, sum(balance) filter (where age between 61 and 90) c,
      sum(balance) filter (where age > 90) d, count(*) n
    from bills group by ledger_id
  )
  select l.id, l.name, l.mobile, l.credit_days,
         case when p_kind = 'supplier' then -coalesce(bal.closing, 0) else coalesce(bal.closing, 0) end,
         coalesce(aged.nd,0)::bigint, coalesce(aged.a,0)::bigint, coalesce(aged.b,0)::bigint,
         coalesce(aged.c,0)::bigint, coalesce(aged.d,0)::bigint, coalesce(aged.n,0)
  from ledgers l
  left join bal on bal.ledger_id = l.id
  left join aged on aged.ledger_id = l.id
  where l.org_id = p_org and l.kind = p_kind and (coalesce(bal.closing,0) <> 0 or aged.n is not null)
  order by abs(coalesce(bal.closing,0)) desc, l.name;
$$;

-- ---------------------------------------------------------------------
-- Adjust an existing receipt / payment against bills later
--   p_allocs: [{invoice_id | purchase_bill_id, amount}]
-- ---------------------------------------------------------------------
create or replace function public.allocate_voucher(p_org uuid, p_voucher uuid, p_allocs jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v vouchers;
  v_used bigint;
  a record;
begin
  if not app.can(p_org, 'voucher', 'edit') then raise exception 'permission denied'; end if;
  select * into v from vouchers where id = p_voucher and org_id = p_org and status = 'posted' for update;
  if not found or v.kind not in ('receipt','payment') then raise exception 'receipt or payment not found'; end if;
  select coalesce(sum(amount),0) into v_used from bill_allocations where voucher_id = v.id;

  for a in select nullif(x->>'invoice_id','')::uuid as invoice_id, nullif(x->>'purchase_bill_id','')::uuid as bill_id,
                  (x->>'amount')::bigint as amount
           from jsonb_array_elements(coalesce(p_allocs,'[]')) x where coalesce((x->>'amount')::bigint,0) > 0
  loop
    if v.kind = 'receipt' then
      if a.invoice_id is null or not exists (select 1 from v_invoice_balance b where b.id = a.invoice_id and b.org_id = p_org
             and b.party_ledger_id = v.party_ledger_id and b.balance >= a.amount) then
        raise exception 'amount is more than the invoice balance, or the invoice is for another party';
      end if;
    elsif a.invoice_id is not null then
      if not exists (select 1 from v_invoice_balance b where b.id = a.invoice_id and b.org_id = p_org
                     and b.party_ledger_id = v.party_ledger_id and -b.balance >= a.amount) then
        raise exception 'refund is more than the amount due back on that invoice';
      end if;
    elsif not exists (select 1 from v_purchase_balance b where b.id = a.bill_id and b.org_id = p_org
                      and b.supplier_ledger_id = v.party_ledger_id and b.balance >= a.amount) then
      raise exception 'amount is more than the purchase bill balance';
    end if;
    insert into bill_allocations (org_id, voucher_id, invoice_id, purchase_bill_id, amount)
    values (p_org, v.id, a.invoice_id, a.bill_id, a.amount);
    v_used := v_used + a.amount;
  end loop;
  if v_used > v.amount then raise exception 'adjusted more than the voucher amount'; end if;
end $$;

create or replace view v_unadjusted_vouchers with (security_invoker = true) as
select v.id, v.org_id, v.fy_id, v.kind, v.voucher_no, v.voucher_date, v.party_ledger_id, v.amount,
       v.amount - coalesce(sum(a.amount), 0) as unadjusted
from vouchers v left join bill_allocations a on a.voucher_id = v.id
where v.status = 'posted' and v.kind in ('receipt','payment') and v.party_ledger_id is not null
group by v.id
having v.amount - coalesce(sum(a.amount), 0) > 0;

-- ---------------------------------------------------------------------
-- Financial years
-- ---------------------------------------------------------------------
create or replace function public.create_next_year(p_org uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  last financial_years;
  v_new uuid;
  v_start date;
begin
  if not app.can(p_org, 'accounts', 'admin') then raise exception 'only the owner can create a financial year'; end if;
  select * into last from financial_years where org_id = p_org order by starts_on desc limit 1;
  v_start := last.ends_on + 1;
  insert into financial_years (org_id, label, starts_on, ends_on)
  values (p_org, to_char(v_start, 'YYYY') || '-' || to_char(v_start + interval '1 year', 'YY'), v_start,
          (v_start + interval '1 year' - interval '1 day')::date)
  returning id into v_new;
  insert into doc_series (org_id, fy_id, doc_type, prefix, pad_to)
  select p_org, v_new, doc_type, prefix, pad_to from doc_series where fy_id = last.id;
  return v_new;
end $$;

-- closing balances of a year become the next year's opening balances.
-- Income and expense accounts are folded into "Profit & Loss A/c" (capital).
-- Safe to re-run while the old year is still open.
create or replace function public.carry_forward(p_org uuid, p_from_fy uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  f financial_years;
  t uuid;
  v_pl uuid;
  v_profit bigint;
  v_n int;
begin
  if not app.can(p_org, 'accounts', 'admin') then raise exception 'only the owner can carry balances forward'; end if;
  select * into f from financial_years where id = p_from_fy and org_id = p_org;
  if not found then raise exception 'year not found'; end if;
  select id into t from financial_years where org_id = p_org and starts_on = f.ends_on + 1;
  if t is null then raise exception 'create the next financial year first'; end if;
  v_pl := app.ensure_sys_ledger(p_org, 'retained_earnings', 'Profit & Loss A/c', 'capital', 'capital');

  select coalesce(sum(b.closing), 0) into v_profit           -- Dr balance = loss
  from app.ledger_balances(p_org, f.id, f.starts_on, f.ends_on) b
  join ledgers l on l.id = b.ledger_id join account_groups g on g.id = l.group_id
  where g.nature in ('income','expense');

  delete from opening_balances where fy_id = t and org_id = p_org;
  insert into opening_balances (org_id, fy_id, ledger_id, amount)
  select p_org, t, ledger_id, sum(amt) from (
    select b.ledger_id, b.closing as amt
    from app.ledger_balances(p_org, f.id, f.starts_on, f.ends_on) b
    join ledgers l on l.id = b.ledger_id join account_groups g on g.id = l.group_id
    where g.nature in ('asset','liability','equity') and b.closing <> 0
    union all select v_pl, v_profit where v_profit <> 0
  ) x group by ledger_id having sum(amt) <> 0;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ledgers', v_n, 'profit', -v_profit);
end $$;

create or replace function public.close_year(p_org uuid, p_fy uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not app.can(p_org, 'accounts', 'admin') then raise exception 'only the owner can close a year'; end if;
  perform public.carry_forward(p_org, p_fy);
  update financial_years set is_closed = true where id = p_fy and org_id = p_org;
end $$;

create or replace function public.reopen_year(p_org uuid, p_fy uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not app.can(p_org, 'accounts', 'admin') then raise exception 'only the owner can reopen a year'; end if;
  update financial_years set is_closed = false where id = p_fy and org_id = p_org;
end $$;

-- opening balances may only change while their year is open
create or replace function app.check_opening_year() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from financial_years where id = coalesce(new.fy_id, old.fy_id) and is_closed) then
    raise exception 'that financial year is closed';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists opening_balances_year on opening_balances;
create trigger opening_balances_year before insert or update or delete on opening_balances
  for each row execute function app.check_opening_year();

do $$
declare f text;
begin
  foreach f in array array[
    'trial_balance(uuid, uuid, date, date)', 'gst_sales_lines(uuid, date, date)', 'gst_hsn_lines(uuid, date, date)',
    'gst_purchase_lines(uuid, date, date)', 'party_outstanding(uuid, uuid, date, text)', 'allocate_voucher(uuid, uuid, jsonb)',
    'create_next_year(uuid)', 'carry_forward(uuid, uuid)', 'close_year(uuid, uuid)', 'reopen_year(uuid, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on all functions in schema app to authenticated;
grant select on v_unadjusted_vouchers to authenticated;
