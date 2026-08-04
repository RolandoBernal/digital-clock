-- Lee-Lee's Tracker shared records.
-- Apply this in Supabase SQL Editor or with Supabase CLI.
-- The browser app uses only the publishable/anon key; RLS below is the security boundary.

create table if not exists public.lee_lee_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  record_type text not null,
  blood_sugar integer,
  insulin_units numeric(6,2),
  administered_insulin_units numeric(6,2),
  suggested_base_units numeric(6,2),
  suggested_correction_units numeric(6,2),
  suggested_total_units numeric(6,2),
  insulin_plan_id text,
  insulin_plan_snapshot jsonb,
  dose_calculation_status text not null default 'manual',
  notes text not null default '',
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  entered_by text not null default 'Unknown' check (entered_by in ('Rolando', 'Emily', 'Unknown')),
  last_edited_by text check (last_edited_by in ('Rolando', 'Emily', 'Unknown')),
  deleted_at timestamptz,
  deleted_by text check (deleted_by in ('Rolando', 'Emily', 'Unknown')),
  source text not null default 'app',
  client_created_at timestamptz,
  migration_fingerprint text,
  import_fingerprint text,
  app_schema_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists lee_lee_records_user_recorded_idx
  on public.lee_lee_records (user_id, recorded_at desc);

create index if not exists lee_lee_records_user_deleted_idx
  on public.lee_lee_records (user_id, deleted_at)
  where deleted_at is not null;

create unique index if not exists lee_lee_records_user_migration_fingerprint_idx
  on public.lee_lee_records (user_id, migration_fingerprint)
  where migration_fingerprint is not null;

create unique index if not exists lee_lee_records_user_import_fingerprint_idx
  on public.lee_lee_records (user_id, import_fingerprint)
  where import_fingerprint is not null;

create or replace function public.set_lee_lee_record_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists set_lee_lee_record_updated_at on public.lee_lee_records;

create trigger set_lee_lee_record_updated_at
before update on public.lee_lee_records
for each row
execute function public.set_lee_lee_record_updated_at();

create or replace function public.update_lee_lee_record_with_version(
  p_id uuid,
  p_expected_version integer,
  p_record_type text,
  p_blood_sugar integer,
  p_insulin_units numeric,
  p_administered_insulin_units numeric,
  p_suggested_base_units numeric,
  p_suggested_correction_units numeric,
  p_suggested_total_units numeric,
  p_insulin_plan_id text,
  p_insulin_plan_snapshot jsonb,
  p_dose_calculation_status text,
  p_notes text,
  p_recorded_at timestamptz,
  p_entered_by text,
  p_last_edited_by text,
  p_deleted_at timestamptz,
  p_deleted_by text,
  p_source text,
  p_client_created_at timestamptz,
  p_migration_fingerprint text,
  p_import_fingerprint text,
  p_app_schema_version integer,
  p_payload jsonb
)
returns public.lee_lee_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  updated_record public.lee_lee_records;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Lee-Lee record updates require an authenticated user.'
      using errcode = '28000';
  end if;

  update public.lee_lee_records
  set
    record_type = p_record_type,
    blood_sugar = p_blood_sugar,
    insulin_units = p_insulin_units,
    administered_insulin_units = p_administered_insulin_units,
    suggested_base_units = p_suggested_base_units,
    suggested_correction_units = p_suggested_correction_units,
    suggested_total_units = p_suggested_total_units,
    insulin_plan_id = p_insulin_plan_id,
    insulin_plan_snapshot = p_insulin_plan_snapshot,
    dose_calculation_status = p_dose_calculation_status,
    notes = pg_catalog.coalesce(p_notes, ''),
    recorded_at = p_recorded_at,
    entered_by = p_entered_by,
    last_edited_by = p_last_edited_by,
    deleted_at = p_deleted_at,
    deleted_by = p_deleted_by,
    source = p_source,
    client_created_at = p_client_created_at,
    migration_fingerprint = p_migration_fingerprint,
    import_fingerprint = p_import_fingerprint,
    app_schema_version = p_app_schema_version,
    payload = pg_catalog.coalesce(p_payload, '{}'::jsonb),
    version = public.lee_lee_records.version + 1
  where
    id = p_id
    and user_id = current_user_id
    and version = p_expected_version
  returning * into updated_record;

  return updated_record;
end;
$$;

revoke all on function public.update_lee_lee_record_with_version(
  uuid, integer, text, integer, numeric, numeric, numeric, numeric, numeric,
  text, jsonb, text, text, timestamptz, text, text, timestamptz, text,
  text, timestamptz, text, text, integer, jsonb
) from public, anon;

grant execute on function public.update_lee_lee_record_with_version(
  uuid, integer, text, integer, numeric, numeric, numeric, numeric, numeric,
  text, jsonb, text, text, timestamptz, text, text, timestamptz, text,
  text, timestamptz, text, text, integer, jsonb
) to authenticated;

alter table public.lee_lee_records enable row level security;

-- Intentionally no DELETE policy.
-- Normal app deletion is implemented as an UPDATE that sets deleted_at/deleted_by.
-- Authenticated browser clients must not permanently delete rows.

revoke all on public.lee_lee_records from anon, public;
revoke update, delete on public.lee_lee_records from authenticated, anon, public;
grant select, insert on public.lee_lee_records to authenticated;

drop policy if exists "Lee-Lee records select owned rows" on public.lee_lee_records;
create policy "Lee-Lee records select owned rows"
on public.lee_lee_records
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Lee-Lee records insert owned rows" on public.lee_lee_records;
create policy "Lee-Lee records insert owned rows"
on public.lee_lee_records
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Lee-Lee records update owned rows" on public.lee_lee_records;

do $$
begin
  alter publication supabase_realtime add table public.lee_lee_records;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
