-- 255_drop_proposal_self_host.sql
-- ----------------------------------------------------------------------------
-- Strip the self-hosted proposal flow. Another team owns the public proposal
-- surface (docs.nativz.io); Cortex no longer needs proposal storage,
-- tier-aware blueprints, intake forms, or signature receipts. Onboarding v2
-- (table `onboardings`, migration 227) stays.
--
-- This migration drops:
--   1. proposal_drafts, proposal_services, proposal_pricing_rules
--      (chat-driven proposal builder, migration 165)
--   2. proposal_events (event log, migration 161)
--   3. proposal_packages, proposal_package_templates, proposal_deliverables
--      (legacy package model, pre-builder)
--   4. proposals (signature receipts, migrations 158/161)
--   5. proposal_templates (templates + tier_intake_blueprint, migrations
--      159/160/167/187/233)
--   6. external FK columns on `clients` and the legacy `onboarding_flows`
--      and `onboarding_checklist_items` tables (cols added by 162/166/167)
--
-- The private storage bucket `proposal-pdfs` is NOT dropped here. Supabase
-- guards `storage.buckets` with a protect_delete trigger that blocks SQL
-- deletes; remove the bucket from the Supabase dashboard (Storage → buckets
-- → proposal-pdfs → delete). It is private and contains zero objects.
--
-- All drops are IF EXISTS + CASCADE so the migration is idempotent and
-- safe to run on environments where some artifacts were already cleaned.
-- ----------------------------------------------------------------------------

begin;

-- 1. Detach external FK columns first so the parent drops cascade cleanly.

alter table if exists public.clients
  drop column if exists auto_created_from_proposal_id;

alter table if exists public.onboarding_flows
  drop column if exists proposal_id,
  drop column if exists template_id,
  drop column if exists tier_id;

alter table if exists public.onboarding_checklist_items
  drop constraint if exists onboarding_checklist_items_kind_check,
  drop column if exists kind,
  drop column if exists template_key,
  drop column if exists required,
  drop column if exists data,
  drop column if exists dont_have,
  drop column if exists submitted_at;

drop index if exists onboarding_checklist_items_template_key_idx;
drop index if exists onboarding_flows_template_idx;
drop index if exists clients_auto_created_from_proposal_id_idx;

-- 2. Drop proposal-builder + receipt + template tables. CASCADE picks up any
--    indexes, RLS policies, triggers, and dependent FKs we missed.

drop table if exists public.proposal_drafts cascade;
drop table if exists public.proposal_services cascade;
drop table if exists public.proposal_pricing_rules cascade;
drop table if exists public.proposal_events cascade;
drop table if exists public.proposal_deliverables cascade;
drop table if exists public.proposal_packages cascade;
drop table if exists public.proposal_package_templates cascade;
drop table if exists public.proposals cascade;
drop table if exists public.proposal_templates cascade;

commit;
