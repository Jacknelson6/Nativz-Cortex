-- 171_brand_audits_admin_rls.sql — tighten brand_audits RLS.
-- ----------------------------------------------------------------------------
-- Migration 170 shipped with `USING (true)` which is effectively wide-open
-- to anyone with PostgREST access. The API-layer check enforces admin-only
-- via createAdminClient() (which bypasses RLS), but defense at the wrong
-- layer means a viewer hitting the table directly with their session JWT
-- would currently see every audit ever run.
--
-- Mirror the API check at the RLS layer using the same predicate already
-- used by migrations 162 / 165 / 168 / 169 for admin-only tables.

DROP POLICY IF EXISTS "Admins manage brand_audits" ON brand_audits;

CREATE POLICY "Admins manage brand_audits"
  ON brand_audits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
        AND (users.role = 'admin' OR users.is_super_admin = TRUE)
    )
  );
