-- =====================================================================
-- Apna Flight — Travel ERP + CRM
-- Migration 0001: initial schema (Supabase / Postgres 15+)
--
-- Conventions
--   * Every tenant table has org_id; access is enforced by row level
--     security (tenancy) + permission checks in server actions (roles).
--   * Money is BIGINT in paise (1 INR = 100). Never floats.
--   * Times are timestamptz (UTC). Business dates (invoice date, travel
--     date) are plain DATE in the org's local calendar.
--   * The accounts are double-entry: every posted document writes
--     balanced rows to ledger_entries. All books and statements are
--     queries over ledger_entries + opening_balances.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists app;

-- ---------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- 1. Platform: organisations, members, roles, years, numbering
-- =====================================================================

-- Reference geography (global, read-only for users; seeded)
create table countries (
  code char(2) primary key,               -- ISO 3166-1 alpha-2
  name text not null,
  dial_code text
);

create table states (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references countries(code) on delete restrict,
  name text not null,
  gst_code char(2) unique,                -- Indian GST state code, e.g. '27' = Maharashtra
  unique (country_code, name)
);

create table cities (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references countries(code) on delete restrict,
  state_id uuid references states(id) on delete set null,
  name text not null,
  unique (country_code, state_id, name)
);
create index on cities (state_id);
create index on cities (lower(name) text_pattern_ops);

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  address_line1 text,
  address_line2 text,
  country_code char(2) not null default 'IN' references countries(code) on delete restrict,
  state_id uuid references states(id) on delete restrict,   -- drives intra/inter-state GST
  city_id uuid references cities(id) on delete set null,
  pincode text,
  phone text,
  mobile text,
  email text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  pan text check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  logo_path text,                         -- Supabase Storage key
  invoice_terms text,
  bank_details jsonb not null default '[]',   -- [{bank, account_name, account_no, ifsc, branch, upi}]
  currency char(3) not null default 'INR',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  is_owner boolean not null default false,   -- owner role bypasses permission checks
  -- {"invoice": ["view","create","edit","delete","post"], "lead": [...], ...}
  permissions jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete restrict,
  display_name text not null,
  designation text,
  mobile text,
  reports_to uuid references org_members(id) on delete set null,   -- CRM hierarchy
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id),
  check (reports_to is distinct from id)
);
create index on org_members (user_id);
create index on org_members (role_id);
create index on org_members (reports_to);

create table org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null,
  role_id uuid not null references roles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on org_invites (org_id);
create index on org_invites (role_id);

create table financial_years (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  label text not null,                    -- '2026-27'
  starts_on date not null,
  ends_on date not null,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, label),
  check (ends_on > starts_on),
  exclude using gist (org_id with =, daterange(starts_on, ends_on, '[]') with &&)
);

create table doc_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  fy_id uuid not null references financial_years(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'lead','quotation','proforma','invoice','credit_note','hotel_voucher',
    'purchase_general','purchase_group','receipt','payment','contra','journal')),
  prefix text not null default '',
  next_no integer not null default 1 check (next_no > 0),
  pad_to smallint not null default 4 check (pad_to between 1 and 10),
  updated_at timestamptz not null default now(),
  unique (org_id, fy_id, doc_type)
);
create index on doc_series (fy_id);

-- =====================================================================
-- 2. Access helpers (used by RLS policies)
-- =====================================================================
create or replace function app.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = p_org and user_id = auth.uid() and is_active
  );
$$;

create or replace function app.member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from org_members
  where org_id = p_org and user_id = auth.uid() and is_active;
$$;

-- permission check for server actions:  select app.can(org, 'invoice', 'post')
create or replace function app.can(p_org uuid, p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.is_owner or (r.permissions -> p_module) ? p_action
    from org_members m join roles r on r.id = m.role_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.is_active
  ), false);
$$;

-- gap-free document numbers; the row lock serialises concurrent callers
create or replace function app.next_doc_no(p_org uuid, p_fy uuid, p_type text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text; v_no integer; v_pad smallint;
begin
  if not app.is_member(p_org) then raise exception 'not a member of org'; end if;
  insert into doc_series (org_id, fy_id, doc_type) values (p_org, p_fy, p_type)
    on conflict (org_id, fy_id, doc_type) do nothing;
  update doc_series set next_no = next_no + 1, updated_at = now()
    where org_id = p_org and fy_id = p_fy and doc_type = p_type
    returning prefix, next_no - 1, pad_to into v_prefix, v_no, v_pad;
  return v_prefix || lpad(v_no::text, v_pad, '0');
end $$;

-- =====================================================================
-- 3. Masters
-- =====================================================================
create table account_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  parent_id uuid references account_groups(id) on delete restrict,
  name text not null,
  nature text not null check (nature in ('asset','liability','income','expense','equity')),
  system_key text,                        -- 'sundry_debtors', 'bank_accounts', ...
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  unique (org_id, system_key)
);
create index on account_groups (parent_id);

create table ledgers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  group_id uuid not null references account_groups(id) on delete restrict,
  name text not null,
  kind text not null check (kind in
    ('customer','supplier','bank','cash','tax','income','expense','capital','other')),
  system_key text,                        -- 'sales_domestic','cgst_output','cash', ...
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  pan text,
  state_id uuid references states(id) on delete set null,
  city_id uuid references cities(id) on delete set null,
  address text,
  contact_person text,
  phone text,
  mobile text,
  email text,
  credit_days smallint not null default 0 check (credit_days >= 0),
  portal_key text,                        -- supplier/portal reference used by imports
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name),
  unique (org_id, system_key)
);
create index on ledgers (group_id);
create index on ledgers (state_id);
create index on ledgers (city_id);
create index on ledgers (org_id, kind);
create index on ledgers (org_id, lower(name) text_pattern_ops);

create table opening_balances (
  org_id uuid not null references orgs(id) on delete cascade,
  fy_id uuid not null references financial_years(id) on delete cascade,
  ledger_id uuid not null references ledgers(id) on delete cascade,
  amount bigint not null,                 -- + debit, - credit (paise)
  updated_at timestamptz not null default now(),
  primary key (fy_id, ledger_id)
);
create index on opening_balances (org_id);
create index on opening_balances (ledger_id);

-- small named lists, one table: booked_by, service_type, visa_type, ...
create table lookups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  kind text not null check (kind in (
    'booked_by','service_type','visa_type','room_type','room_category','taxi_type',
    'meal_plan','package_type','followup_action','package_class','package_title',
    'activity','destination','bank_name','hotel_service','taxi_service')),
  name text not null,
  sort smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index on lookups (org_id, kind, lower(name));

create table airlines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs(id) on delete cascade,   -- null = global seed
  code text not null,                     -- IATA, e.g. '6E'
  name text not null,
  created_at timestamptz not null default now()
);
create unique index on airlines (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

create table sectors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null,                     -- 'DEL-BOM'
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table passengers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  party_ledger_id uuid references ledgers(id) on delete set null,
  title text check (title in ('MR','MRS','MS','MSTR','MISS','DR')),
  first_name text not null,
  last_name text,
  dob date,
  gender text check (gender in ('M','F','X')),
  mobile text,
  email text,
  address text,
  country_code char(2) references countries(code) on delete set null,
  city_id uuid references cities(id) on delete set null,
  passport_no text,
  passport_expiry date,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on passengers (party_ledger_id);
create index on passengers (city_id);
create index on passengers (org_id, lower(first_name) text_pattern_ops);
create index on passengers (org_id, mobile);

create table passenger_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  passenger_id uuid not null references passengers(id) on delete cascade,
  kind text not null check (kind in ('passport','visa','id','photo','other')),
  storage_path text not null,             -- private bucket key
  expires_on date,
  created_at timestamptz not null default now()
);
create index on passenger_documents (passenger_id);
create index on passenger_documents (org_id);

-- =====================================================================
-- 4. CRM
-- =====================================================================
create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  lead_no text not null,
  enquiry_date date not null default current_date,
  guest_name text not null,
  email text,
  phone text not null,
  party_ledger_id uuid references ledgers(id) on delete set null,
  start_place text,
  travel_date date,
  travel_date_open boolean not null default false,
  services text[] not null default '{}' check (services <@ array[
    'flight','hotel','visa','tour_package','transport','train_bus','activities','other']),
  adults smallint not null default 1 check (adults >= 1),
  children_above_12 smallint not null default 0 check (children_above_12 >= 0),
  children_6_12 smallint not null default 0 check (children_6_12 >= 0),
  infants smallint not null default 0 check (infants >= 0),
  source text check (source in
    ('walk_in','call','email','whatsapp','website','ivr','reference','ads','excel')),
  reference text,
  budget bigint check (budget >= 0),
  remarks varchar(250),
  status text not null default 'initial' check (status in
    ('initial','active','proposal','negotiation','pipeline','booked','not_interested','fake')),
  assigned_to uuid references org_members(id) on delete set null,
  next_followup_at timestamptz,           -- maintained by trigger from lead_followups
  last_followup_at timestamptz,
  created_by uuid references org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, lead_no),
  check (travel_date is not null or travel_date_open)
);
create index on leads (org_id, status);
create index on leads (org_id, enquiry_date desc);
create index on leads (org_id, assigned_to);
create index on leads (org_id, next_followup_at);
create index on leads (org_id, phone);
create index on leads (party_ledger_id);
create index on leads (assigned_to);
create index on leads (created_by);

create table lead_followups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  action text not null check (action in
    ('call','meeting_fixed','spoke','proposal_sent','cancel','other')),
  due_at timestamptz not null,            -- start of chosen 2-hour slot
  done_at timestamptz,
  outcome text,
  created_by uuid references org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on lead_followups (lead_id, due_at);
create index on lead_followups (org_id, due_at) where done_at is null;
create index on lead_followups (created_by);

create or replace function app.refresh_lead_followup() returns trigger
language plpgsql as $$
declare v_lead uuid := coalesce(new.lead_id, old.lead_id);
begin
  update leads l set
    next_followup_at = (select min(due_at) from lead_followups
                        where lead_id = v_lead and done_at is null),
    last_followup_at = (select max(done_at) from lead_followups where lead_id = v_lead)
  where l.id = v_lead;
  return null;
end $$;
create trigger lead_followups_refresh after insert or update or delete on lead_followups
  for each row execute function app.refresh_lead_followup();

create table routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,                     -- 'Delhi – Shimla – Manali – Delhi'
  destination_id uuid references lookups(id) on delete set null,
  has_transport boolean not null default false,
  supplier_ledger_id uuid references ledgers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create index on routes (destination_id);
create index on routes (supplier_ledger_id);

create table policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  kind text not null check (kind in ('general','other')),
  name text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, kind, name)
);

create table itineraries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  title text not null,
  route_id uuid references routes(id) on delete set null,
  package_title_id uuid references lookups(id) on delete set null,
  nights smallint not null check (nights >= 0),
  overview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on itineraries (org_id);
create index on itineraries (route_id);
create index on itineraries (package_title_id);

create table itinerary_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  itinerary_id uuid not null references itineraries(id) on delete cascade,
  day_no smallint not null check (day_no >= 1),
  city_id uuid references cities(id) on delete set null,
  title text not null,
  description text,
  unique (itinerary_id, day_no)
);
create index on itinerary_days (org_id);
create index on itinerary_days (city_id);

create table hotels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  city_id uuid references cities(id) on delete set null,
  address text,
  star_rating smallint check (star_rating between 1 and 7),
  contact_name text,
  phone text,
  mobile text,
  email text,
  supplier_ledger_id uuid references ledgers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on hotels (org_id, city_id);
create index on hotels (city_id);
create index on hotels (supplier_ledger_id);

create table hotel_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete cascade,
  package_class_id uuid references lookups(id) on delete restrict,
  room_category_id uuid references lookups(id) on delete restrict,
  meal_plan_id uuid references lookups(id) on delete restrict,
  pax_per_room smallint not null default 2 check (pax_per_room between 1 and 10),
  rate_type text not null check (rate_type in ('per_room_night','per_person_night','extra_adult','extra_child')),
  sell_rate bigint not null check (sell_rate >= 0),
  cost_rate bigint not null default 0 check (cost_rate >= 0),
  valid_from date not null,
  valid_to date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to >= valid_from)
);
create index on hotel_rates (hotel_id, valid_from);
create index on hotel_rates (org_id);
create index on hotel_rates (package_class_id);
create index on hotel_rates (room_category_id);
create index on hotel_rates (meal_plan_id);

create table activity_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  activity_id uuid not null references lookups(id) on delete restrict,
  city_id uuid references cities(id) on delete set null,
  location text,
  unit text not null default 'per_person' check (unit in ('per_person','per_group','per_vehicle')),
  start_time time,
  end_time time,
  duration_minutes integer check (duration_minutes > 0),
  sell_rate bigint not null check (sell_rate >= 0),
  cost_rate bigint not null default 0 check (cost_rate >= 0),
  supplier_ledger_id uuid references ledgers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on activity_rates (org_id, city_id);
create index on activity_rates (activity_id);
create index on activity_rates (city_id);
create index on activity_rates (supplier_ledger_id);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  capacity smallint check (capacity > 0),
  rate_per_km bigint not null default 0 check (rate_per_km >= 0),
  min_km_per_day integer not null default 0 check (min_km_per_day >= 0),
  night_charge bigint not null default 0 check (night_charge >= 0),
  supplier_ledger_id uuid references ledgers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create index on vehicles (supplier_ledger_id);

create table quotations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  fy_id uuid not null references financial_years(id) on delete restrict,
  quote_no text not null,
  quote_date date not null default current_date,
  lead_id uuid references leads(id) on delete set null,
  party_ledger_id uuid references ledgers(id) on delete set null,
  client_name text not null,
  itinerary_id uuid references itineraries(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  package_title_id uuid references lookups(id) on delete set null,
  meal_plan_id uuid references lookups(id) on delete set null,
  start_date date,
  nights smallint check (nights >= 0),
  adults smallint not null default 1 check (adults >= 1),
  children smallint not null default 0 check (children >= 0),
  infants smallint not null default 0 check (infants >= 0),
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  cost_total bigint not null default 0,
  markup bigint not null default 0,
  tax_total bigint not null default 0,
  grand_total bigint not null default 0,
  inclusions text,
  exclusions text,
  terms text,
  created_by uuid references org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, fy_id, quote_no)
);
create index on quotations (org_id, quote_date desc);
create index on quotations (org_id, status);
create index on quotations (fy_id);
create index on quotations (lead_id);
create index on quotations (party_ledger_id);
create index on quotations (itinerary_id);
create index on quotations (route_id);
create index on quotations (package_title_id);
create index on quotations (meal_plan_id);
create index on quotations (created_by);

create table quotation_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  quotation_id uuid not null references quotations(id) on delete cascade,
  sort smallint not null default 0,
  kind text not null check (kind in ('hotel','activity','vehicle','flight','visa','insurance','other')),
  day_no smallint,
  description text not null,
  hotel_rate_id uuid references hotel_rates(id) on delete set null,
  activity_rate_id uuid references activity_rates(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  qty numeric(10,2) not null default 1 check (qty > 0),
  unit_cost bigint not null default 0,
  unit_price bigint not null default 0,
  amount bigint not null default 0
);
create index on quotation_items (quotation_id, sort);
create index on quotation_items (org_id);
create index on quotation_items (hotel_rate_id);
create index on quotation_items (activity_rate_id);
create index on quotation_items (vehicle_id);

-- =====================================================================
-- 5. Billing: invoices, proformas and credit notes share one table
-- =====================================================================
create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  fy_id uuid not null references financial_years(id) on delete restrict,
  doc_kind text not null default 'invoice' check (doc_kind in ('invoice','proforma','credit_note')),
  bill_type text not null check (bill_type in (
    'domestic','international','hotel','visa_insurance','train_bus','taxi',
    'misc_service','bill_of_supply','tour','commission')),
  invoice_no text not null,
  invoice_date date not null,
  due_date date,
  party_ledger_id uuid not null references ledgers(id) on delete restrict,
  booked_by_id uuid references lookups(id) on delete set null,
  contact_phone text,
  place_of_supply_state_id uuid references states(id) on delete restrict,
  is_interstate boolean not null default false,
  lead_id uuid references leads(id) on delete set null,
  quotation_id uuid references quotations(id) on delete set null,
  ref_invoice_id uuid references invoices(id) on delete restrict,   -- credit note -> original
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  -- totals (denormalised from lines on post)
  sale_before_tax bigint not null default 0,
  taxable bigint not null default 0,
  cgst bigint not null default 0,
  sgst bigint not null default 0,
  igst bigint not null default 0,
  total bigint not null default 0,
  purchase_total bigint not null default 0,
  cancel_charges bigint not null default 0 check (cancel_charges >= 0),   -- credit notes
  -- e-invoice
  irn text,
  irn_ack_no text,
  irn_ack_at timestamptz,
  notes text,
  created_by uuid references org_members(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, fy_id, doc_kind, invoice_no),
  check (doc_kind = 'credit_note' or ref_invoice_id is null),
  check (igst = 0 or (cgst = 0 and sgst = 0))
);
create index on invoices (org_id, invoice_date desc);
create index on invoices (org_id, doc_kind, status);
create index on invoices (fy_id);
create index on invoices (party_ledger_id, invoice_date);
create index on invoices (booked_by_id);
create index on invoices (place_of_supply_state_id);
create index on invoices (lead_id);
create index on invoices (quotation_id);
create index on invoices (ref_invoice_id);
create index on invoices (created_by);

-- group / fixed-departure purchases (declared before invoice_lines, which link seats to them)
create table purchase_bills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  fy_id uuid not null references financial_years(id) on delete restrict,
  kind text not null check (kind in ('general','group')),
  bill_no text not null,                  -- our internal number
  bill_date date not null,
  supplier_ledger_id uuid not null references ledgers(id) on delete restrict,
  supplier_bill_no text,
  supplier_bill_date date,
  place_of_supply_state_id uuid references states(id) on delete restrict,
  -- group purchase details
  airline_id uuid references airlines(id) on delete set null,
  flight_no text,
  pnr text,
  sector text,
  travel_date date,
  seats smallint check (seats > 0),
  -- totals (denormalised from lines on post)
  taxable bigint not null default 0,
  cgst bigint not null default 0,
  sgst bigint not null default 0,
  igst bigint not null default 0,
  tds bigint not null default 0,
  total bigint not null default 0,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  notes text,
  created_by uuid references org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, fy_id, kind, bill_no),
  check (kind = 'group' or seats is null)
);
create index on purchase_bills (org_id, bill_date desc);
create index on purchase_bills (fy_id);
create index on purchase_bills (supplier_ledger_id, bill_date);
create index on purchase_bills (place_of_supply_state_id);
create index on purchase_bills (airline_id);
create index on purchase_bills (created_by);

create table purchase_bill_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  purchase_bill_id uuid not null references purchase_bills(id) on delete cascade,
  sort smallint not null default 0,
  ledger_id uuid not null references ledgers(id) on delete restrict,   -- expense / purchase ledger
  description text,
  taxable bigint not null check (taxable >= 0),
  gst_rate numeric(5,2) not null default 0 check (gst_rate between 0 and 28),
  cgst bigint not null default 0,
  sgst bigint not null default 0,
  igst bigint not null default 0,
  amount bigint not null,
  check (amount = taxable + cgst + sgst + igst)
);
create index on purchase_bill_lines (purchase_bill_id, sort);
create index on purchase_bill_lines (org_id);
create index on purchase_bill_lines (ledger_id);

-- One line = one ticket / room / visa / service. Each line carries the
-- SALE to the client and the PURCHASE from the supplier, so margin and
-- loss alerts are per line.
create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  sort smallint not null default 0,
  service text not null check (service in (
    'flight','hotel','visa','insurance','train','bus','taxi','misc','tour','commission','cancellation_charge')),
  description text,
  -- travel details (flight / train / bus)
  passenger_id uuid references passengers(id) on delete set null,
  pax_name text,
  pax_type text check (pax_type in ('adult','child','infant')),
  airline_id uuid references airlines(id) on delete set null,
  flight_no text,
  pnr text,
  ticket_no text,
  sector text,                            -- 'DEL-BOM-DEL'
  travel_date date,
  return_date date,
  -- hotel / visa / other specifics: {hotel, check_in, check_out, rooms, room_type, meal_plan, country, visa_type, ...}
  details jsonb not null default '{}',
  -- SALE (paise)
  basic bigint not null default 0,        -- base fare / room tariff
  xt bigint not null default 0,           -- airline taxes collected (pass-through)
  service_fee bigint not null default 0,
  other_charges bigint not null default 0,
  discount bigint not null default 0 check (discount >= 0),
  taxable bigint not null default 0,      -- value on which GST is charged
  gst_rate numeric(5,2) not null default 0 check (gst_rate between 0 and 28),
  cgst bigint not null default 0,
  sgst bigint not null default 0,
  igst bigint not null default 0,
  net_sale bigint not null default 0,
  -- PURCHASE (paise)
  supplier_ledger_id uuid references ledgers(id) on delete restrict,
  supplier_invoice_no text,
  supplier_invoice_date date,
  group_purchase_id uuid references purchase_bills(id) on delete set null,
  purchase_gross bigint not null default 0,  -- supplier's bill incl. its GST
  purchase_gst bigint not null default 0,    -- input tax inside purchase_gross (ITC)
  commission bigint not null default 0,      -- earned from supplier
  tds bigint not null default 0,             -- deducted by supplier on commission
  net_purchase bigint not null default 0,    -- payable to supplier
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (net_sale = basic + xt + service_fee + other_charges - discount + cgst + sgst + igst),
  check (net_purchase = purchase_gross - commission + tds),
  check (igst = 0 or (cgst = 0 and sgst = 0)),
  check (supplier_ledger_id is not null or (purchase_gross = 0 and commission = 0 and tds = 0)),
  check (return_date is null or travel_date is null or return_date >= travel_date)
);
create index on invoice_lines (invoice_id, sort);
create index on invoice_lines (org_id, pnr);
create index on invoice_lines (org_id, ticket_no);
create index on invoice_lines (org_id, travel_date);
create index on invoice_lines (passenger_id);
create index on invoice_lines (airline_id);
create index on invoice_lines (supplier_ledger_id);
create index on invoice_lines (group_purchase_id);

create table hotel_vouchers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  fy_id uuid not null references financial_years(id) on delete restrict,
  voucher_no text not null,
  voucher_date date not null,
  kind text not null default 'hotel' check (kind in ('hotel','cruise')),
  party_ledger_id uuid references ledgers(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  hotel_id uuid references hotels(id) on delete set null,
  property_name text not null,
  guest_name text not null,
  guests jsonb not null default '[]',
  adults smallint not null default 1,
  children smallint not null default 0,
  check_in date not null,
  check_out date not null,
  rooms smallint not null default 1 check (rooms > 0),
  room_type text,
  meal_plan text,
  confirmation_no text,
  contact text,
  inclusions text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, fy_id, voucher_no),
  check (check_out > check_in)
);
create index on hotel_vouchers (org_id, check_in);
create index on hotel_vouchers (fy_id);
create index on hotel_vouchers (party_ledger_id);
create index on hotel_vouchers (invoice_id);
create index on hotel_vouchers (hotel_id);

-- =====================================================================
-- 6. Vouchers (receipt / payment / contra / journal)
-- =====================================================================
create table vouchers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  fy_id uuid not null references financial_years(id) on delete restrict,
  kind text not null check (kind in ('receipt','payment','contra','journal')),
  voucher_no text not null,
  voucher_date date not null,
  party_ledger_id uuid references ledgers(id) on delete restrict,      -- display; truth is in lines
  cash_bank_ledger_id uuid references ledgers(id) on delete restrict,
  amount bigint not null check (amount > 0),
  mode text check (mode in ('cash','cheque','bank_transfer','upi','card','gateway','adjustment')),
  cheque_no text,
  cheque_date date,
  cheque_bank text,
  reference text,
  narration text,
  status text not null default 'posted' check (status in ('posted','cancelled')),
  payment_link_id uuid,                   -- FK added after payment_links
  created_by uuid references org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, fy_id, kind, voucher_no)
);
create index on vouchers (org_id, voucher_date desc);
create index on vouchers (org_id, kind, voucher_date desc);
create index on vouchers (fy_id);
create index on vouchers (party_ledger_id);
create index on vouchers (cash_bank_ledger_id);
create index on vouchers (created_by);

create table voucher_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  voucher_id uuid not null references vouchers(id) on delete cascade,
  sort smallint not null default 0,
  ledger_id uuid not null references ledgers(id) on delete restrict,
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  narration text,
  check ((debit > 0) <> (credit > 0))
);
create index on voucher_lines (voucher_id, sort);
create index on voucher_lines (org_id);
create index on voucher_lines (ledger_id);

-- receipts/payments matched against bills ("Bill Adjustment")
create table bill_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  voucher_id uuid not null references vouchers(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  purchase_bill_id uuid references purchase_bills(id) on delete cascade,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  check ((invoice_id is null) <> (purchase_bill_id is null))
);
create index on bill_allocations (org_id);
create index on bill_allocations (voucher_id);
create index on bill_allocations (invoice_id);
create index on bill_allocations (purchase_bill_id);

-- =====================================================================
-- 7. The general ledger
-- =====================================================================
create table ledger_entries (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  fy_id uuid not null references financial_years(id) on delete restrict,
  entry_date date not null,
  ledger_id uuid not null references ledgers(id) on delete restrict,
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  source_type text not null check (source_type in ('invoice','purchase_bill','voucher')),
  source_id uuid not null,
  doc_no text not null,
  narration text,
  created_at timestamptz not null default now(),
  check ((debit > 0) <> (credit > 0))
);
create index on ledger_entries (org_id, ledger_id, entry_date);
create index on ledger_entries (org_id, fy_id, entry_date);
create index on ledger_entries (ledger_id);
create index on ledger_entries (fy_id);
create index on ledger_entries (source_type, source_id);

-- every source document must balance (checked at commit)
create or replace function app.check_entries_balance() returns trigger
language plpgsql as $$
declare v_diff bigint;
begin
  select coalesce(sum(debit - credit), 0) into v_diff
  from ledger_entries where source_type = new.source_type and source_id = new.source_id;
  if v_diff <> 0 then
    raise exception 'ledger entries for % % do not balance (diff % paise)',
      new.source_type, new.source_id, v_diff;
  end if;
  return null;
end $$;
create constraint trigger ledger_entries_balanced
  after insert or update on ledger_entries
  deferrable initially deferred
  for each row execute function app.check_entries_balance();

-- block entries dated in a closed year or outside the year
create or replace function app.check_entry_year() returns trigger
language plpgsql as $$
declare fy financial_years;
begin
  select * into fy from financial_years where id = new.fy_id;
  if fy.is_closed then raise exception 'financial year % is closed', fy.label; end if;
  if new.entry_date not between fy.starts_on and fy.ends_on then
    raise exception 'date % is outside financial year %', new.entry_date, fy.label;
  end if;
  if fy.org_id <> new.org_id then raise exception 'year belongs to another org'; end if;
  return new;
end $$;
create trigger ledger_entries_year before insert or update on ledger_entries
  for each row execute function app.check_entry_year();

-- =====================================================================
-- 8. Imports, payments, messaging
-- =====================================================================
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  target text not null check (target in ('billing','vouchers','ledgers')),
  format text not null,                   -- 'generic','galileo','amadeus','tripjack',...
  file_path text not null,
  status text not null default 'parsed' check (status in ('parsed','partially_generated','generated','failed')),
  row_count integer not null default 0,
  created_by uuid references org_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on import_batches (org_id, created_at desc);
create index on import_batches (created_by);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_no integer not null,
  raw jsonb not null,
  parsed jsonb,
  error text,
  invoice_id uuid references invoices(id) on delete set null,
  voucher_id uuid references vouchers(id) on delete set null,
  unique (batch_id, row_no)
);
create index on import_rows (org_id);
create index on import_rows (invoice_id);
create index on import_rows (voucher_id);

create table payment_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  provider text not null check (provider in ('razorpay','cashfree')),
  provider_ref text not null,
  purpose text not null check (purpose in ('receipt','booking','client_collection','other')),
  reference text,
  amount bigint not null check (amount > 0),
  party_ledger_id uuid references ledgers(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_mobile text,
  url text,
  status text not null default 'created' check (status in ('created','paid','expired','cancelled','failed')),
  paid_at timestamptz,
  created_by uuid references org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index on payment_links (org_id, created_at desc);
create index on payment_links (party_ledger_id);
create index on payment_links (invoice_id);
create index on payment_links (created_by);

alter table vouchers add constraint vouchers_payment_link_fk
  foreign key (payment_link_id) references payment_links(id) on delete set null;
create index on vouchers (payment_link_id);

-- webhook idempotency: insert first, process only if the insert succeeded
create table webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  processed_at timestamptz,
  primary key (provider, event_id)
);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  doc_type text not null,                 -- 'invoice','receipt','hotel_voucher','followup',...
  channel text not null check (channel in ('email','whatsapp','sms')),
  subject text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, doc_type, channel)
);

-- =====================================================================
-- 9. Posting: documents -> ledger_entries (only path that writes the GL)
-- =====================================================================
create or replace function app.sys_ledger(p_org uuid, p_key text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from ledgers where org_id = p_org and system_key = p_key;
$$;

create or replace function app.post_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv invoices;
  s integer;        -- +1 invoice, -1 credit note (reverses Dr/Cr)
  l record;
  v_sales uuid;
  v_purchase uuid;
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

  -- roll up totals
  update invoices i set
    sale_before_tax = t.sbt, taxable = t.taxable, cgst = t.cgst, sgst = t.sgst,
    igst = t.igst, total = t.total, purchase_total = t.purchase,
    status = 'posted', posted_at = coalesce(i.posted_at, now())
  from (
    select coalesce(sum(net_sale - cgst - sgst - igst),0) sbt, coalesce(sum(taxable),0) taxable,
           coalesce(sum(cgst),0) cgst, coalesce(sum(sgst),0) sgst, coalesce(sum(igst),0) igst,
           coalesce(sum(net_sale),0) total, coalesce(sum(net_purchase),0) purchase
    from invoice_lines where invoice_id = inv.id
  ) t
  where i.id = inv.id
  returning i.* into inv;

  -- SALE: Dr party / Cr sales + output GST
  insert into ledger_entries (org_id, fy_id, entry_date, ledger_id, debit, credit, source_type, source_id, doc_no, narration)
  select inv.org_id, inv.fy_id, inv.invoice_date, x.ledger_id,
         greatest(s * x.amt, 0), greatest(-s * x.amt, 0), 'invoice', inv.id, inv.invoice_no, x.narr
  from (values
      (inv.party_ledger_id,                         inv.total,            'Sale'),
      (v_sales,                                    -inv.sale_before_tax,  'Sale'),
      (app.sys_ledger(inv.org_id,'cgst_output'),   -inv.cgst,             'CGST'),
      (app.sys_ledger(inv.org_id,'sgst_output'),   -inv.sgst,             'SGST'),
      (app.sys_ledger(inv.org_id,'igst_output'),   -inv.igst,             'IGST')
  ) as x(ledger_id, amt, narr)
  where x.amt <> 0;

  -- PURCHASE per supplier: Dr purchase (net of ITC) + Dr input GST + Dr TDS receivable
  --                        Cr commission income + Cr supplier
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
        (v_purchase,                                    l.pur,      'Purchase'),
        (app.sys_ledger(inv.org_id,'gst_input'),        l.itc,      'Input GST'),
        (app.sys_ledger(inv.org_id,'tds_receivable'),   l.tds,      'TDS on commission'),
        (app.sys_ledger(inv.org_id,'commission_income'), -l.comm,   'Commission'),
        (l.supplier_ledger_id,                         -l.payable,  'Purchase')
    ) as x(ledger_id, amt, narr)
    where x.amt <> 0;
  end loop;
end $$;

create or replace function app.post_voucher(p_voucher uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v vouchers;
begin
  select * into v from vouchers where id = p_voucher for update;
  if not found then raise exception 'voucher not found'; end if;
  if not app.can(v.org_id, 'voucher', 'post') then raise exception 'permission denied'; end if;
  delete from ledger_entries where source_type = 'voucher' and source_id = v.id;
  if v.status = 'cancelled' then return; end if;
  insert into ledger_entries (org_id, fy_id, entry_date, ledger_id, debit, credit, source_type, source_id, doc_no, narration)
  select v.org_id, v.fy_id, v.voucher_date, ledger_id, debit, credit, 'voucher', v.id, v.voucher_no,
         coalesce(narration, v.narration)
  from voucher_lines where voucher_id = v.id;
end $$;

create or replace function app.post_purchase_bill(p_bill uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b purchase_bills;
begin
  select * into b from purchase_bills where id = p_bill for update;
  if not found then raise exception 'purchase bill not found'; end if;
  if not app.can(b.org_id, 'purchase', 'post') then raise exception 'permission denied'; end if;
  delete from ledger_entries where source_type = 'purchase_bill' and source_id = b.id;

  update purchase_bills pb set
    taxable = t.taxable, cgst = t.cgst, sgst = t.sgst, igst = t.igst,
    total = t.amount - pb.tds, status = 'posted'
  from (select coalesce(sum(taxable),0) taxable, coalesce(sum(cgst),0) cgst, coalesce(sum(sgst),0) sgst,
               coalesce(sum(igst),0) igst, coalesce(sum(amount),0) amount
        from purchase_bill_lines where purchase_bill_id = b.id) t
  where pb.id = b.id returning pb.* into b;

  insert into ledger_entries (org_id, fy_id, entry_date, ledger_id, debit, credit, source_type, source_id, doc_no, narration)
  select b.org_id, b.fy_id, b.bill_date, ledger_id, sum(taxable), 0, 'purchase_bill', b.id, b.bill_no, 'Purchase'
  from purchase_bill_lines where purchase_bill_id = b.id group by ledger_id having sum(taxable) > 0;

  insert into ledger_entries (org_id, fy_id, entry_date, ledger_id, debit, credit, source_type, source_id, doc_no, narration)
  select b.org_id, b.fy_id, b.bill_date, x.ledger_id,
         greatest(x.amt, 0), greatest(-x.amt, 0), 'purchase_bill', b.id, b.bill_no, x.narr
  from (values
      (app.sys_ledger(b.org_id,'gst_input'),     b.cgst + b.sgst + b.igst, 'Input GST'),
      (app.sys_ledger(b.org_id,'tds_payable'),  -b.tds,                    'TDS deducted'),
      (b.supplier_ledger_id,                    -b.total,                  'Purchase')
  ) as x(ledger_id, amt, narr)
  where x.amt <> 0;
end $$;

-- =====================================================================
-- 10. Report building blocks
-- =====================================================================
-- amount still due on each posted invoice / credit note
create view v_invoice_balance with (security_invoker = true) as
select i.id, i.org_id, i.fy_id, i.doc_kind, i.bill_type, i.invoice_no, i.invoice_date, i.due_date,
       i.party_ledger_id, i.total,
       coalesce(a.allocated, 0) as allocated,
       i.total - coalesce(a.allocated, 0) as balance,
       case when coalesce(a.allocated,0) = 0 then 'unpaid'
            when coalesce(a.allocated,0) >= i.total then 'paid'
            else 'partial' end as pay_status
from invoices i
left join (select invoice_id, sum(amount) allocated from bill_allocations
           where invoice_id is not null group by invoice_id) a on a.invoice_id = i.id
where i.status = 'posted';

-- margin per invoice line (sales register, loss alerts)
create view v_invoice_line_margin with (security_invoker = true) as
select l.id, l.org_id, l.invoice_id, i.invoice_no, i.invoice_date, i.bill_type, i.doc_kind,
       i.party_ledger_id, l.supplier_ledger_id, l.service,
       l.net_sale - l.cgst - l.sgst - l.igst                      as sale_ex_tax,
       l.purchase_gross - l.purchase_gst - l.commission + l.tds   as cost_ex_tax,
       (l.net_sale - l.cgst - l.sgst - l.igst)
         - (l.purchase_gross - l.purchase_gst - l.commission + l.tds) as margin
from invoice_lines l join invoices i on i.id = l.invoice_id
where i.status = 'posted';

-- ledger balances for a period: opening (year opening + entries before p_from) and movement
create or replace function app.ledger_balances(p_org uuid, p_fy uuid, p_from date, p_to date)
returns table (ledger_id uuid, opening bigint, debit bigint, credit bigint, closing bigint)
language sql stable security invoker set search_path = public as $$
  with ob as (
    select ledger_id, amount from opening_balances where fy_id = p_fy and org_id = p_org
  ), mv as (
    select ledger_id,
           sum(case when entry_date <  p_from then debit - credit else 0 end) as before,
           sum(case when entry_date >= p_from then debit else 0 end) as dr,
           sum(case when entry_date >= p_from then credit else 0 end) as cr
    from ledger_entries
    where org_id = p_org and fy_id = p_fy and entry_date <= p_to
    group by ledger_id
  )
  select l.id,
         coalesce(ob.amount,0) + coalesce(mv.before,0),
         coalesce(mv.dr,0), coalesce(mv.cr,0),
         coalesce(ob.amount,0) + coalesce(mv.before,0) + coalesce(mv.dr,0) - coalesce(mv.cr,0)
  from ledgers l
  left join ob on ob.ledger_id = l.id
  left join mv on mv.ledger_id = l.id
  where l.org_id = p_org and (ob.ledger_id is not null or mv.ledger_id is not null);
$$;

-- =====================================================================
-- 11. New organisation bootstrap (called once after sign-up)
-- =====================================================================
create or replace function app.create_org(p_name text, p_state_gst_code char(2), p_fy_start date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_role uuid; v_fy uuid; v_uid uuid := auth.uid();
  g record; bt text;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  insert into orgs (name, state_id, created_by)
  values (p_name, (select id from states where gst_code = p_state_gst_code), v_uid)
  returning id into v_org;

  insert into roles (org_id, name, is_owner) values (v_org, 'Owner', true) returning id into v_role;
  insert into roles (org_id, name, permissions) values
    (v_org, 'Sales', '{"lead":["view","create","edit"],"quotation":["view","create","edit"],"invoice":["view"]}'),
    (v_org, 'Accounts', '{"invoice":["view","create","edit","post"],"voucher":["view","create","edit","post"],"purchase":["view","create","edit","post"],"reports":["view"]}');
  insert into org_members (org_id, user_id, role_id, display_name)
  values (v_org, v_uid, v_role, coalesce((select email from auth.users where id = v_uid), 'Owner'));

  insert into financial_years (org_id, label, starts_on, ends_on)
  values (v_org,
          to_char(p_fy_start, 'YYYY') || '-' || to_char(p_fy_start + interval '1 year', 'YY'),
          p_fy_start, (p_fy_start + interval '1 year' - interval '1 day')::date)
  returning id into v_fy;

  -- chart of accounts
  insert into account_groups (org_id, name, nature, system_key, sort) values
    (v_org, 'Capital Account',      'equity',    'capital',          1),
    (v_org, 'Current Liabilities',  'liability', 'current_liabilities', 2),
    (v_org, 'Current Assets',       'asset',     'current_assets',   3),
    (v_org, 'Fixed Assets',         'asset',     'fixed_assets',     4),
    (v_org, 'Sales Accounts',       'income',    'sales',            5),
    (v_org, 'Direct Incomes',       'income',    'direct_income',    6),
    (v_org, 'Indirect Incomes',     'income',    'indirect_income',  7),
    (v_org, 'Purchase Accounts',    'expense',   'purchase',         8),
    (v_org, 'Direct Expenses',      'expense',   'direct_expense',   9),
    (v_org, 'Indirect Expenses',    'expense',   'indirect_expense', 10);
  for g in select * from (values
      ('Sundry Debtors',   'current_assets',      'sundry_debtors'),
      ('Bank Accounts',    'current_assets',      'bank_accounts'),
      ('Cash-in-Hand',     'current_assets',      'cash'),
      ('Loans & Advances', 'current_assets',      'loans_advances'),
      ('Sundry Creditors', 'current_liabilities', 'sundry_creditors'),
      ('Duties & Taxes',   'current_liabilities', 'duties_taxes')
    ) as x(name, parent_key, key)
  loop
    insert into account_groups (org_id, parent_id, name, nature, system_key)
    select v_org, p.id, g.name, p.nature, g.key from account_groups p
    where p.org_id = v_org and p.system_key = g.parent_key;
  end loop;

  -- system ledgers
  insert into ledgers (org_id, group_id, name, kind, system_key)
  select v_org, ag.id, x.name, x.kind, x.key
  from (values
      ('Cash',                     'cash',             'cash',  'cash'),
      ('CGST Output',              'duties_taxes',     'tax',   'cgst_output'),
      ('SGST Output',              'duties_taxes',     'tax',   'sgst_output'),
      ('IGST Output',              'duties_taxes',     'tax',   'igst_output'),
      ('GST Input',                'duties_taxes',     'tax',   'gst_input'),
      ('TDS Payable',              'duties_taxes',     'tax',   'tds_payable'),
      ('TDS Receivable',           'loans_advances',   'tax',   'tds_receivable'),
      ('Commission Received',      'direct_income',    'income','commission_income'),
      ('Round Off',                'indirect_expense', 'expense','round_off')
  ) as x(name, grp, kind, key)
  join account_groups ag on ag.org_id = v_org and ag.system_key = x.grp;

  foreach bt in array array['domestic','international','hotel','visa_insurance','train_bus','taxi',
                            'misc_service','bill_of_supply','tour','commission'] loop
    insert into ledgers (org_id, group_id, name, kind, system_key)
    select v_org, id, 'Sales - ' || initcap(replace(bt,'_',' ')), 'income', 'sales_' || bt
    from account_groups where org_id = v_org and system_key = 'sales';
    insert into ledgers (org_id, group_id, name, kind, system_key)
    select v_org, id, 'Purchase - ' || initcap(replace(bt,'_',' ')), 'expense', 'purchase_' || bt
    from account_groups where org_id = v_org and system_key = 'purchase';
  end loop;

  -- number series
  insert into doc_series (org_id, fy_id, doc_type, prefix)
  select v_org, v_fy, t, p from (values
    ('lead','L-'),('quotation','Q-'),('proforma','PI-'),('invoice','INV-'),('credit_note','CN-'),
    ('hotel_voucher','HV-'),('purchase_general','PB-'),('purchase_group','GP-'),
    ('receipt','RV-'),('payment','PV-'),('contra','CV-'),('journal','JV-')) s(t, p);

  -- default lookups
  insert into lookups (org_id, kind, name) values
    (v_org,'meal_plan','EP (No Meals)'), (v_org,'meal_plan','CP (Breakfast)'),
    (v_org,'meal_plan','MAP (Breakfast & Dinner)'), (v_org,'meal_plan','AP (All Meals)'),
    (v_org,'followup_action','Call'), (v_org,'followup_action','Meeting'),
    (v_org,'room_category','Standard'), (v_org,'room_category','Deluxe'),
    (v_org,'package_class','Standard'), (v_org,'package_class','Deluxe'), (v_org,'package_class','Luxury');

  return v_org;
end $$;

-- =====================================================================
-- 12. updated_at triggers
-- =====================================================================
do $$
declare t text;
begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
           where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger %I before update on %I for each row execute function app.touch_updated_at()',
                   t || '_touch', t);
  end loop;
end $$;

-- =====================================================================
-- 13. Row level security
-- =====================================================================
-- Global reference data: readable by any signed-in user, writable by nobody (seeded by migration).
alter table countries enable row level security;
alter table states    enable row level security;
alter table cities    enable row level security;
create policy read_all on countries for select to authenticated using (true);
create policy read_all on states    for select to authenticated using (true);
create policy read_all on cities    for select to authenticated using (true);

alter table webhook_events enable row level security;   -- service role only; no policies

-- airlines: global rows (org_id null) readable by all; org rows by members
alter table airlines enable row level security;
create policy read on airlines for select to authenticated
  using (org_id is null or app.is_member(org_id));
create policy write on airlines for all to authenticated
  using (org_id is not null and app.is_member(org_id))
  with check (org_id is not null and app.is_member(org_id));

-- orgs: members read; owners update; creation only through app.create_org()
alter table orgs enable row level security;
create policy read on orgs for select to authenticated using (app.is_member(id));
create policy update_owner on orgs for update to authenticated
  using (app.can(id, 'org', 'edit')) with check (app.can(id, 'org', 'edit'));

-- the general ledger is read-only to users; only the post_* functions write it
alter table ledger_entries enable row level security;
create policy read on ledger_entries for select to authenticated using (app.is_member(org_id));

-- every other tenant table: members of the org get full access;
-- finer permissions (who may post, delete, see reports) are checked in server actions via app.can().
do $$
declare t text;
begin
  for t in select unnest(array[
    'roles','org_members','org_invites','financial_years','doc_series',
    'account_groups','ledgers','opening_balances','lookups','sectors','passengers','passenger_documents',
    'leads','lead_followups','routes','policies','itineraries','itinerary_days','hotels','hotel_rates',
    'activity_rates','vehicles','quotations','quotation_items',
    'invoices','invoice_lines','purchase_bills','purchase_bill_lines','hotel_vouchers',
    'vouchers','voucher_lines','bill_allocations',
    'import_batches','import_rows','payment_links','message_templates'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy member_all on %I for all to authenticated
                    using (app.is_member(org_id)) with check (app.is_member(org_id))', t);
  end loop;
end $$;

-- posted documents can't be deleted (cancel them instead)
create policy no_delete_posted on invoices as restrictive for delete to authenticated
  using (status = 'draft');
create policy no_delete_posted on purchase_bills as restrictive for delete to authenticated
  using (status = 'draft');

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
