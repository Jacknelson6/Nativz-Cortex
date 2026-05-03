-- Migration 228: drop legacy onboarding tables
--
-- WHY
-- Migration 227 introduced the unified `onboardings` table that replaces
-- the legacy onboarding_trackers + onboarding_phases + onboarding_*
-- support tables. Phase 4 of the onboarding rebuild has now removed every
-- live code path that read from those tables; this migration drops them.
--
-- A handful of tables (onboarding_checklist_groups, onboarding_checklist_items,
-- onboarding_flow_segments, onboarding_flows) are still referenced by the
-- scheduling/new admin page and stay until that surface is rebuilt.
-- A follow-up cleanup migration will retire them.
--
-- Drops are wrapped in IF EXISTS + CASCADE so re-running the migration on
-- partially-cleaned environments is idempotent.

DROP TABLE IF EXISTS public.onboarding_email_sends CASCADE;
DROP TABLE IF EXISTS public.onboarding_email_templates CASCADE;
DROP TABLE IF EXISTS public.onboarding_events CASCADE;
DROP TABLE IF EXISTS public.onboarding_notification_jobs CASCADE;
DROP TABLE IF EXISTS public.onboarding_uploads CASCADE;
DROP TABLE IF EXISTS public.onboarding_phases CASCADE;
DROP TABLE IF EXISTS public.onboarding_trackers CASCADE;
