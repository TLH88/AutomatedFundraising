-- Fix Supabase "Security Definer View" warnings for dashboard metrics views.
-- Forces the views to run with the querying user's permissions (RLS-aware).

alter view if exists public.v_fundraising_totals
  set (security_invoker = true);

alter view if exists public.v_animals_impact
  set (security_invoker = true);

