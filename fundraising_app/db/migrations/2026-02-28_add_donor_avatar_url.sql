alter table if exists public.donors
  add column if not exists avatar_url text;

