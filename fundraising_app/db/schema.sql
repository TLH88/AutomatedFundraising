-- AutomatedFundraising / Funds 4 Furry Friends
-- Unified Supabase schema for:
--   1) Existing donor-outreach automation pipeline
--   2) Expanded internal fundraising CRM dashboard
--
-- Safe to run in Supabase SQL editor (Postgres 15+).
-- Review RLS policies before production use.

create extension if not exists pgcrypto;

-- ============================================================================
-- Shared utilities
-- ============================================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Outreach automation (existing scope)
-- ============================================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  category text,
  donation_potential_score integer check (donation_potential_score between 1 and 10),
  address text,
  city text,
  state text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_website_unique unique (name, website)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  full_name text,
  title text,
  email text unique,
  phone text,
  justification text,
  confidence text check (confidence in ('high','medium','low')),
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject_template text not null,
  body_template text not null,
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  donation_impact_default text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  sent_at timestamptz,
  status text check (status in ('pending','sent','failed','bounced','opened','replied','unsubscribed')),
  error_message text,
  tracking_pixel_id text,
  provider text default 'sendgrid',
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_sends_unique_campaign_contact unique (campaign_id, contact_id)
);

-- ============================================================================
-- Expanded CRM (new scope)
-- ============================================================================

create table if not exists public.donors (
  id uuid primary key default gen_random_uuid(),
  external_ref text,
  first_name text not null,
  last_name text,
  display_name text generated always as (
    btrim(first_name || ' ' || coalesce(last_name, ''))
  ) stored,
  email text unique,
  phone text,
  donor_tier text not null default 'friend' check (donor_tier in ('hero','champion','supporter','friend')),
  donor_status text not null default 'active' check (donor_status in ('active','lapsed','prospect','inactive')),
  donation_type_preference text check (donation_type_preference in ('monthly','one-time','quarterly','annual')),
  engagement_score integer default 50 check (engagement_score between 0 and 100),
  total_donated numeric(12,2) not null default 0,
  first_donation_date date,
  last_donation_date date,
  notes text,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.donor_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists public.donor_tag_assignments (
  donor_id uuid not null references public.donors(id) on delete cascade,
  tag_id uuid not null references public.donor_tags(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (donor_id, tag_id)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  category text not null default 'general',
  status text not null default 'draft' check (status in ('draft','active','paused','completed','archived')),
  description text,
  goal_amount numeric(12,2) not null default 0,
  raised_amount numeric(12,2) not null default 0,
  start_date date,
  end_date date,
  hero_image_url text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.donors(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  donation_date timestamptz not null default now(),
  donation_type text not null default 'one-time' check (donation_type in ('one-time','monthly','quarterly','annual','pledge')),
  source text not null default 'manual' check (source in ('manual','website','event','email','phone','check','cash','grant')),
  payment_status text not null default 'completed' check (payment_status in ('pending','completed','failed','refunded')),
  receipt_sent boolean not null default false,
  is_major_gift boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.animals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  species text not null default 'dog',
  breed text,
  sex text check (sex in ('male','female','unknown')),
  age_group text check (age_group in ('baby','young','adult','senior')),
  status text not null default 'in_care' check (status in ('available','adopted','in_care','foster','medical_hold')),
  intake_date date,
  rescue_date date,
  adoption_date date,
  photo_url text,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null default 'fundraiser' check (event_type in ('fundraiser','adoption','volunteer','workshop','community')),
  status text not null default 'planned' check (status in ('planned','published','cancelled','completed')),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_name text,
  location_address text,
  capacity integer,
  rsvp_count integer not null default 0,
  fundraising_goal numeric(12,2),
  funds_raised numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  donor_id uuid references public.donors(id) on delete set null,
  full_name text,
  email text,
  guests_count integer not null default 1,
  status text not null default 'going' check (status in ('going','interested','cancelled','waitlist')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'email' check (channel in ('email','sms','phone','direct_mail')),
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'email' check (channel in ('email','sms','phone','direct_mail')),
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','paused','cancelled')),
  template_id uuid references public.communication_templates(id) on delete set null,
  audience_segment text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  open_rate numeric(5,2),
  click_rate numeric(5,2),
  attributed_revenue numeric(12,2) default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  communication_campaign_id uuid references public.communication_campaigns(id) on delete cascade,
  donor_id uuid references public.donors(id) on delete set null,
  channel text not null default 'email',
  subject text,
  body text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','opened','clicked','failed','bounced','unsubscribed')),
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.impact_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  report_type text not null default 'monthly' check (report_type in ('monthly','quarterly','annual','campaign','custom')),
  status text not null default 'draft' check (status in ('draft','generating','published','archived')),
  period_start date,
  period_end date,
  summary text,
  data_snapshot jsonb not null default '{}'::jsonb,
  generated_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.success_stories (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid references public.animals(id) on delete set null,
  title text not null,
  slug text unique,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  excerpt text,
  body text,
  cover_image_url text,
  published_at timestamptz,
  views_count integer not null default 0,
  likes_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  full_name text not null,
  email text not null unique,
  role text not null default 'viewer' check (role in ('administrator','editor','viewer')),
  status text not null default 'active' check (status in ('active','inactive','invited','disabled')),
  title text,
  avatar_url text,
  last_active_at timestamptz,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.help_articles (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  slug text unique,
  body text,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_team_member_id uuid references public.team_members(id) on delete set null,
  actor_label text,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('discover','extract_contacts','send_campaign','sync_tracking','custom')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  triggered_by text,
  external_run_id text,
  started_at timestamptz,
  completed_at timestamptz,
  progress_percent integer default 0 check (progress_percent between 0 and 100),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_run_events (
  id uuid primary key default gen_random_uuid(),
  automation_run_id uuid not null references public.automation_runs(id) on delete cascade,
  event_type text not null default 'info' check (event_type in ('info','progress','warning','error','complete')),
  message text not null,
  progress_percent integer check (progress_percent between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_contact_email on public.contacts(email);
create index if not exists idx_contact_org on public.contacts(org_id);
create index if not exists idx_unique_send_lookup on public.email_sends(contact_id, campaign_id);
create index if not exists idx_send_campaign on public.email_sends(campaign_id);
create index if not exists idx_send_status on public.email_sends(status);
create index if not exists idx_org_score on public.organizations(donation_potential_score desc);
create index if not exists idx_org_category on public.organizations(category);

create index if not exists idx_donors_status_tier on public.donors(donor_status, donor_tier);
create index if not exists idx_donors_last_donation on public.donors(last_donation_date desc);
create index if not exists idx_donations_donor on public.donations(donor_id);
create index if not exists idx_donations_campaign on public.donations(campaign_id);
create index if not exists idx_donations_date on public.donations(donation_date desc);
create index if not exists idx_campaigns_status on public.campaigns(status);
create index if not exists idx_campaigns_dates on public.campaigns(start_date, end_date);
create index if not exists idx_animals_status on public.animals(status);
create index if not exists idx_events_time on public.events(starts_at);
create index if not exists idx_comm_campaigns_status on public.communication_campaigns(status);
create index if not exists idx_comm_messages_campaign on public.communication_messages(communication_campaign_id);
create index if not exists idx_reports_type_status on public.impact_reports(report_type, status);
create index if not exists idx_stories_status_published on public.success_stories(status, published_at desc);
create index if not exists idx_activity_entity on public.activity_log(entity_type, entity_id, created_at desc);
create index if not exists idx_automation_runs_type_status on public.automation_runs(run_type, status, created_at desc);
create index if not exists idx_automation_events_run on public.automation_run_events(automation_run_id, created_at);

-- ============================================================================
-- Triggers
-- ============================================================================

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
for each row execute function public.update_updated_at();

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at before update on public.contacts
for each row execute function public.update_updated_at();

drop trigger if exists trg_email_campaigns_updated_at on public.email_campaigns;
create trigger trg_email_campaigns_updated_at before update on public.email_campaigns
for each row execute function public.update_updated_at();

drop trigger if exists trg_email_sends_updated_at on public.email_sends;
create trigger trg_email_sends_updated_at before update on public.email_sends
for each row execute function public.update_updated_at();

drop trigger if exists trg_donors_updated_at on public.donors;
create trigger trg_donors_updated_at before update on public.donors
for each row execute function public.update_updated_at();

drop trigger if exists trg_donations_updated_at on public.donations;
create trigger trg_donations_updated_at before update on public.donations
for each row execute function public.update_updated_at();

drop trigger if exists trg_campaigns_updated_at on public.campaigns;
create trigger trg_campaigns_updated_at before update on public.campaigns
for each row execute function public.update_updated_at();

drop trigger if exists trg_animals_updated_at on public.animals;
create trigger trg_animals_updated_at before update on public.animals
for each row execute function public.update_updated_at();

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at before update on public.events
for each row execute function public.update_updated_at();

drop trigger if exists trg_event_rsvps_updated_at on public.event_rsvps;
create trigger trg_event_rsvps_updated_at before update on public.event_rsvps
for each row execute function public.update_updated_at();

drop trigger if exists trg_communication_templates_updated_at on public.communication_templates;
create trigger trg_communication_templates_updated_at before update on public.communication_templates
for each row execute function public.update_updated_at();

drop trigger if exists trg_communication_campaigns_updated_at on public.communication_campaigns;
create trigger trg_communication_campaigns_updated_at before update on public.communication_campaigns
for each row execute function public.update_updated_at();

drop trigger if exists trg_communication_messages_updated_at on public.communication_messages;
create trigger trg_communication_messages_updated_at before update on public.communication_messages
for each row execute function public.update_updated_at();

drop trigger if exists trg_impact_reports_updated_at on public.impact_reports;
create trigger trg_impact_reports_updated_at before update on public.impact_reports
for each row execute function public.update_updated_at();

drop trigger if exists trg_success_stories_updated_at on public.success_stories;
create trigger trg_success_stories_updated_at before update on public.success_stories
for each row execute function public.update_updated_at();

drop trigger if exists trg_team_members_updated_at on public.team_members;
create trigger trg_team_members_updated_at before update on public.team_members
for each row execute function public.update_updated_at();

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at before update on public.app_settings
for each row execute function public.update_updated_at();

drop trigger if exists trg_help_articles_updated_at on public.help_articles;
create trigger trg_help_articles_updated_at before update on public.help_articles
for each row execute function public.update_updated_at();

drop trigger if exists trg_automation_runs_updated_at on public.automation_runs;
create trigger trg_automation_runs_updated_at before update on public.automation_runs
for each row execute function public.update_updated_at();

-- ============================================================================
-- Derived metrics views (used by dashboard API)
-- ============================================================================

create or replace view public.v_fundraising_totals as
select
  coalesce(sum(case when payment_status = 'completed' then amount else 0 end), 0)::numeric(12,2) as total_raised,
  coalesce(sum(case
      when payment_status = 'completed'
       and donation_date >= date_trunc('month', now())
      then amount else 0 end), 0)::numeric(12,2) as month_raised,
  count(*) filter (where payment_status = 'completed') as donation_count,
  count(distinct donor_id) filter (where payment_status = 'completed') as unique_donors
from public.donations;

create or replace view public.v_animals_impact as
select
  count(*) filter (where status = 'adopted') as adopted_total,
  count(*) filter (where rescue_date >= date_trunc('month', now())::date) as rescued_this_month,
  count(*) filter (where status in ('in_care','foster','medical_hold')) as currently_in_care
from public.animals;

-- ============================================================================
-- RLS (development-safe defaults; tighten before public deployment)
-- ============================================================================

alter table public.organizations enable row level security;
alter table public.contacts enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_sends enable row level security;
alter table public.donors enable row level security;
alter table public.donor_tags enable row level security;
alter table public.donor_tag_assignments enable row level security;
alter table public.campaigns enable row level security;
alter table public.donations enable row level security;
alter table public.animals enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.communication_templates enable row level security;
alter table public.communication_campaigns enable row level security;
alter table public.communication_messages enable row level security;
alter table public.impact_reports enable row level security;
alter table public.success_stories enable row level security;
alter table public.team_members enable row level security;
alter table public.app_settings enable row level security;
alter table public.help_articles enable row level security;
alter table public.activity_log enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_run_events enable row level security;

-- For internal dashboard development with publishable key + explicit anon policies.
-- Replace with authenticated role policies before production launch.
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','contacts','email_campaigns','email_sends','donors','donor_tags',
    'donor_tag_assignments','campaigns','donations','animals','events','event_rsvps',
    'communication_templates','communication_campaigns','communication_messages',
    'impact_reports','success_stories','team_members','app_settings','help_articles',
    'activity_log','automation_runs','automation_run_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_rw', t);
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      t || '_anon_rw', t
    );
  end loop;
end $$;

-- ============================================================================
-- Notes
-- ============================================================================
-- 1) This schema intentionally preserves the original outreach tables while
--    adding the fundraising CRM entities used by the dashboard UI.
-- 2) For production: replace permissive anon RLS policies with authenticated
--    role-based policies and move writes to server-side endpoints.
