-- =====================================================================
-- Migration 0008 (Milestone 6): saved column mappings for Excel imports,
-- and a link from imported rows to the file they came from.
-- =====================================================================

create table if not exists import_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  target text not null check (target in ('billing','vouchers','ledgers')),
  name text not null,                     -- e.g. 'Tripjack', 'Galileo', 'My Excel'
  mapping jsonb not null default '{}',    -- {field: "Header in the file"}
  defaults jsonb not null default '{}',   -- {client_ledger_id, supplier_ledger_id, gst_rate, group_by, ...}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, target, name)
);
create index if not exists import_mappings_org on import_mappings (org_id);

alter table import_mappings enable row level security;
create policy member_all on import_mappings for all to authenticated
  using (app.is_member(org_id)) with check (app.is_member(org_id));
create trigger import_mappings_touch before update on import_mappings
  for each row execute function app.touch_updated_at();

-- original file name, for the import history
alter table import_batches add column if not exists file_name text;
alter table import_batches alter column file_path drop not null;

grant select, insert, update, delete on import_mappings to authenticated;
