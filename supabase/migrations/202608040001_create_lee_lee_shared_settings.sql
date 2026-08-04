-- Lee-Lee's Tracker shared patient and clinic settings.
-- Apply after 202608030001_create_lee_lee_tracker_records.sql.
-- Browser clients use only SELECT/INSERT plus the version-aware RPC below.

create table if not exists public.lee_lee_shared_settings (
  user_id uuid primary key references auth.users(id) on delete restrict,
  patient_name text,
  patient_date_of_birth date,
  clinic_name text,
  clinic_phone text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  last_edited_by text check (last_edited_by in ('Rolando', 'Emily', 'Unknown')),
  payload jsonb not null default '{}'::jsonb,
  app_schema_version integer not null default 1
);

create or replace function public.set_lee_lee_shared_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists set_lee_lee_shared_settings_updated_at on public.lee_lee_shared_settings;

create trigger set_lee_lee_shared_settings_updated_at
before update on public.lee_lee_shared_settings
for each row
execute function public.set_lee_lee_shared_settings_updated_at();

create or replace function public.update_lee_lee_shared_settings_with_version(
  p_expected_version integer,
  p_patient_name text,
  p_patient_date_of_birth date,
  p_clinic_name text,
  p_clinic_phone text,
  p_last_edited_by text,
  p_payload jsonb,
  p_app_schema_version integer
)
returns public.lee_lee_shared_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  updated_settings public.lee_lee_shared_settings;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Lee-Lee shared settings updates require an authenticated user.'
      using errcode = '28000';
  end if;

  update public.lee_lee_shared_settings
  set
    patient_name = p_patient_name,
    patient_date_of_birth = p_patient_date_of_birth,
    clinic_name = p_clinic_name,
    clinic_phone = p_clinic_phone,
    last_edited_by = p_last_edited_by,
    payload = pg_catalog.coalesce(p_payload, '{}'::jsonb),
    app_schema_version = p_app_schema_version,
    version = public.lee_lee_shared_settings.version + 1
  where
    user_id = current_user_id
    and version = p_expected_version
  returning * into updated_settings;

  return updated_settings;
end;
$$;

revoke all on function public.update_lee_lee_shared_settings_with_version(
  integer, text, date, text, text, text, jsonb, integer
) from public, anon;

grant execute on function public.update_lee_lee_shared_settings_with_version(
  integer, text, date, text, text, text, jsonb, integer
) to authenticated;

alter table public.lee_lee_shared_settings enable row level security;

-- Intentionally no DELETE policy.
-- Shared settings are updated through a version-aware RPC and are not hard-deleted by browser clients.

revoke all on public.lee_lee_shared_settings from anon, public;
revoke update, delete on public.lee_lee_shared_settings from authenticated, anon, public;
grant select, insert on public.lee_lee_shared_settings to authenticated;

drop policy if exists "Lee-Lee shared settings select own row" on public.lee_lee_shared_settings;
create policy "Lee-Lee shared settings select own row"
on public.lee_lee_shared_settings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Lee-Lee shared settings insert own row" on public.lee_lee_shared_settings;
create policy "Lee-Lee shared settings insert own row"
on public.lee_lee_shared_settings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Lee-Lee shared settings update own row" on public.lee_lee_shared_settings;

do $$
begin
  alter publication supabase_realtime add table public.lee_lee_shared_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
