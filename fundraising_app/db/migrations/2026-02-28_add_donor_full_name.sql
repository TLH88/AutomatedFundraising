alter table if exists public.donors
  add column if not exists full_name text;

update public.donors
set full_name = btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
where coalesce(nullif(btrim(full_name), ''), '') = '';

