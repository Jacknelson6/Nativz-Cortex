-- Migration 259: Address Supabase security advisor warnings
--
-- Two safe categories handled here:
--   1. function_search_path_mutable: pin search_path on 25 trigger/utility
--      functions in `public`. Pure metadata change — no behavior impact.
--   2. anon_security_definer_function_executable +
--      authenticated_security_definer_function_executable: revoke EXECUTE on
--      SECURITY DEFINER credit/knowledge RPCs from anon/authenticated. These
--      are only ever called via service-role (createAdminClient), so service
--      role keeps working (it bypasses GRANTs).
--
-- Intentionally NOT touched in this migration (would risk breakage):
--   * `is_admin()`, `viewer_has_client_access()` — used inside RLS policies,
--     must stay executable by anon/authenticated.
--   * `record_vote()` — public voting flow, anon callable by design.
--   * `vector` extension in public — moving requires recreating dependents.
--   * brain.* RLS policies — schema is service-role only; brain isn't
--     exposed via PostgREST.
--   * Public bucket SELECT policies — needed for public delivery URLs.
--   * Public-schema RLS policies on admin-only tables — gated by service-role
--     usage in app code; tightening risks blocking unknown call sites.
--   * Auth leaked password protection — dashboard setting, not SQL.

-- =============================================================================
-- 1. Pin search_path on flagged trigger/utility functions
-- =============================================================================

ALTER FUNCTION public.bump_brand_ad_templates_updated_at() SET search_path = '';
ALTER FUNCTION public.set_tiktok_shop_searches_updated_at() SET search_path = '';
ALTER FUNCTION public.set_ad_concepts_updated_at() SET search_path = '';
ALTER FUNCTION public.reserve_ad_concept_slugs(uuid, integer) SET search_path = '';
ALTER FUNCTION public.client_benchmarks_touch_updated_at() SET search_path = '';
ALTER FUNCTION public.payroll_touch_updated_at() SET search_path = '';
ALTER FUNCTION public.set_client_groups_updated_at() SET search_path = '';
ALTER FUNCTION public.touch_review_contacts_updated_at() SET search_path = '';
ALTER FUNCTION public.set_onboarding_updated_at() SET search_path = '';
ALTER FUNCTION public.editing_projects_set_updated_at() SET search_path = '';
ALTER FUNCTION public.set_updated_at_proposal() SET search_path = '';
ALTER FUNCTION public.set_ad_reference_ads_updated_at() SET search_path = '';
ALTER FUNCTION public.set_ad_monthly_generation_settings_updated_at() SET search_path = '';
ALTER FUNCTION public.set_ad_assets_updated_at() SET search_path = '';
ALTER FUNCTION public.notification_settings_touch_updated_at() SET search_path = '';
ALTER FUNCTION public._resolve_deliverable_type_id(text) SET search_path = '';
ALTER FUNCTION public.monthly_deliverable_slots_set_updated_at() SET search_path = '';
ALTER FUNCTION public.trg_scheduled_posts_refund_credit() SET search_path = '';
ALTER FUNCTION public.onboardings_set_updated_at() SET search_path = '';

-- The credit RPCs are SECURITY DEFINER and reference public.* + auth.uid()
-- internally. Use 'public, pg_temp' rather than '' so unqualified references
-- to public tables/types inside the function bodies keep resolving.
ALTER FUNCTION public.refund_credit(text, uuid, text)
  SET search_path = 'public, pg_temp';
ALTER FUNCTION public.grant_credit(uuid, text, integer, text, text, uuid, text, text)
  SET search_path = 'public, pg_temp';
ALTER FUNCTION public.expire_credit(uuid, integer, text, text, text)
  SET search_path = 'public, pg_temp';
ALTER FUNCTION public.consume_credit(uuid, text, uuid, uuid, uuid, text, text, uuid, integer, uuid)
  SET search_path = 'public, pg_temp';
ALTER FUNCTION public.reset_balance_row(uuid, uuid)
  SET search_path = 'public, pg_temp';
ALTER FUNCTION public.monthly_reset_for_client(uuid)
  SET search_path = 'public, pg_temp';

-- =============================================================================
-- 2. Revoke EXECUTE on service-role-only SECURITY DEFINER RPCs
--
-- All callers use createAdminClient() (service role) — confirmed in
-- lib/credits/{consume,grant,refund}.ts, lib/knowledge/temporal-search.ts,
-- and app/api/cron/credits-reset/route.ts. Service role bypasses GRANTs,
-- so revoking from anon/authenticated does not break any code path.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.consume_credit(uuid, text, uuid, uuid, uuid, text, text, uuid, integer, uuid)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.grant_credit(uuid, text, integer, text, text, uuid, text, text)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.refund_credit(text, uuid, text)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.expire_credit(uuid, integer, text, text, text)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.monthly_reset_for_client(uuid)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.reset_balance_row(uuid, uuid)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.get_current_knowledge(uuid, text, integer)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.get_current_knowledge(uuid, text[], integer)
  FROM anon, authenticated, public;

REVOKE EXECUTE ON FUNCTION public.get_knowledge_history(uuid, text, integer)
  FROM anon, authenticated, public;
