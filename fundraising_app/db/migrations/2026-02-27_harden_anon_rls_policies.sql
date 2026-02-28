-- Harden RLS defaults for production posture.
-- Removes blanket anon read/write policies created by the development schema.
-- Keep backend writes through server-side API using service role key.

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
  end loop;
end $$;

-- Optional: allow public read of help articles only.
drop policy if exists help_articles_anon_ro on public.help_articles;
create policy help_articles_anon_ro on public.help_articles
  for select to anon
  using (true);

-- Optional: allow public read of published success stories.
drop policy if exists success_stories_anon_ro on public.success_stories;
create policy success_stories_anon_ro on public.success_stories
  for select to anon
  using (coalesce(status, '') = 'published');

