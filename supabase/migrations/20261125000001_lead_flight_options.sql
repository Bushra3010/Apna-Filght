-- =====================================================================
-- Migration 0009: flight options on a lead.
-- The agent looks up the flights on a route and date, keeps three or four,
-- types their own rate against each and sends the list to the customer.
-- =====================================================================

create table if not exists lead_flight_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  airline text not null,                  -- 'IndiGo'
  flight_no text not null,                -- '6E 2135'
  from_code text not null,                -- IATA airport, 'BOM'
  to_code text not null,                  -- 'DEL'
  travel_date date not null,
  depart_time text,                       -- local time at the airport, 'HH:MM'
  arrive_time text,
  price bigint check (price is null or price >= 0),  -- the agent's rate, in paise; null until typed
  created_by uuid references org_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lead_flight_options_lead on lead_flight_options (lead_id, travel_date, depart_time);
create index if not exists lead_flight_options_org on lead_flight_options (org_id);

alter table lead_flight_options enable row level security;
create policy member_all on lead_flight_options for all to authenticated
  using (app.is_member(org_id)) with check (app.is_member(org_id));
create trigger lead_flight_options_touch before update on lead_flight_options
  for each row execute function app.touch_updated_at();

grant select, insert, update, delete on lead_flight_options to authenticated;
