-- Upgrade existing outreach organizations table to store org-level contact/location data.
-- Safe to run multiple times.

alter table if exists public.organizations
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists email text,
  add column if not exists phone text;

-- Optional visibility check after migration (safe read-only)
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'organizations'
-- order by ordinal_position;
