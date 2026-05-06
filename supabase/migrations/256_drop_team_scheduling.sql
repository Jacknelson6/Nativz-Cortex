-- 256_drop_team_scheduling.sql
-- ----------------------------------------------------------------------------
-- Strip the team-availability + scheduling pick flow. Another team owns this
-- surface; Cortex no longer needs the team-availability grid, the per-person
-- calendar overlay, the public /schedule/[token] picker, or the SA-driven
-- freebusy reads. The content calendar (`/admin/calendar`, content_drops,
-- calendar_connections client invites, `/api/calendar/{drops,gaps,invite,
-- review,share}`) stays.
--
-- This migration drops:
--   1. team_scheduling_event_picks  (per-pick rows)
--   2. team_scheduling_event_members (member roster per event)
--   3. team_scheduling_events       (parent event with share_token)
--   4. scheduling_person_emails     (alias emails per person)
--   5. scheduling_people            (team-side person identity)
--
-- All drops use IF EXISTS + CASCADE so the migration is idempotent.
-- ----------------------------------------------------------------------------

begin;

drop table if exists public.team_scheduling_event_picks cascade;
drop table if exists public.team_scheduling_event_members cascade;
drop table if exists public.team_scheduling_events cascade;
drop table if exists public.scheduling_person_emails cascade;
drop table if exists public.scheduling_people cascade;

commit;
