-- Tightens permissive (USING true / WITH CHECK true) RLS policies flagged by the
-- Supabase advisor. All callers verified to use createAdminClient() = service_role,
-- which bypasses RLS, so swapping permissive -> is_admin() does not break runtime.
-- service_role keeps full access through bypass; admin auth users keep access via
-- the is_admin() helper; anon + viewer lose the unintended write paths.

-- =========================
-- brain.* schema (no code callers; tighten to admin-only)
-- =========================

-- brand_dna
DROP POLICY IF EXISTS brain_brand_dna_insert ON brain.brand_dna;
DROP POLICY IF EXISTS brain_brand_dna_update ON brain.brand_dna;
CREATE POLICY brain_brand_dna_insert ON brain.brand_dna FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_brand_dna_update ON brain.brand_dna FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- client_contacts
DROP POLICY IF EXISTS brain_client_contacts_delete ON brain.client_contacts;
DROP POLICY IF EXISTS brain_client_contacts_insert ON brain.client_contacts;
DROP POLICY IF EXISTS brain_client_contacts_update ON brain.client_contacts;
CREATE POLICY brain_client_contacts_delete ON brain.client_contacts FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY brain_client_contacts_insert ON brain.client_contacts FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_client_contacts_update ON brain.client_contacts FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- client_platforms
DROP POLICY IF EXISTS brain_client_platforms_delete ON brain.client_platforms;
DROP POLICY IF EXISTS brain_client_platforms_insert ON brain.client_platforms;
DROP POLICY IF EXISTS brain_client_platforms_update ON brain.client_platforms;
CREATE POLICY brain_client_platforms_delete ON brain.client_platforms FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY brain_client_platforms_insert ON brain.client_platforms FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_client_platforms_update ON brain.client_platforms FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- client_profiles
DROP POLICY IF EXISTS brain_client_profiles_insert ON brain.client_profiles;
DROP POLICY IF EXISTS brain_client_profiles_update ON brain.client_profiles;
CREATE POLICY brain_client_profiles_insert ON brain.client_profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_client_profiles_update ON brain.client_profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- clients
DROP POLICY IF EXISTS brain_clients_insert ON brain.clients;
DROP POLICY IF EXISTS brain_clients_update ON brain.clients;
CREATE POLICY brain_clients_insert ON brain.clients FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_clients_update ON brain.clients FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- corrections (insert only flagged)
DROP POLICY IF EXISTS brain_corrections_insert ON brain.corrections;
CREATE POLICY brain_corrections_insert ON brain.corrections FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- documents
DROP POLICY IF EXISTS brain_documents_insert ON brain.documents;
DROP POLICY IF EXISTS brain_documents_update ON brain.documents;
CREATE POLICY brain_documents_insert ON brain.documents FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_documents_update ON brain.documents FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- evidence_links (insert only flagged)
DROP POLICY IF EXISTS brain_evidence_links_insert ON brain.evidence_links;
CREATE POLICY brain_evidence_links_insert ON brain.evidence_links FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- facts
DROP POLICY IF EXISTS brain_facts_insert ON brain.facts;
DROP POLICY IF EXISTS brain_facts_update ON brain.facts;
CREATE POLICY brain_facts_insert ON brain.facts FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_facts_update ON brain.facts FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- frameworks
DROP POLICY IF EXISTS brain_frameworks_insert ON brain.frameworks;
DROP POLICY IF EXISTS brain_frameworks_update ON brain.frameworks;
CREATE POLICY brain_frameworks_insert ON brain.frameworks FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_frameworks_update ON brain.frameworks FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- onboarding_guides (single ALL policy)
DROP POLICY IF EXISTS "Allow all operations on onboarding_guides" ON brain.onboarding_guides;
CREATE POLICY brain_onboarding_guides_all ON brain.onboarding_guides FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- onboarding_progress (single ALL policy)
DROP POLICY IF EXISTS "Allow all operations on onboarding_progress" ON brain.onboarding_progress;
CREATE POLICY brain_onboarding_progress_all ON brain.onboarding_progress FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- relationships (insert only flagged)
DROP POLICY IF EXISTS brain_relationships_insert ON brain.relationships;
CREATE POLICY brain_relationships_insert ON brain.relationships FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- team_members
DROP POLICY IF EXISTS brain_team_members_insert ON brain.team_members;
DROP POLICY IF EXISTS brain_team_members_update ON brain.team_members;
CREATE POLICY brain_team_members_insert ON brain.team_members FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_team_members_update ON brain.team_members FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- topic_searches
DROP POLICY IF EXISTS brain_topic_searches_insert ON brain.topic_searches;
DROP POLICY IF EXISTS brain_topic_searches_update ON brain.topic_searches;
CREATE POLICY brain_topic_searches_insert ON brain.topic_searches FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_topic_searches_update ON brain.topic_searches FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- trust_scores
DROP POLICY IF EXISTS brain_trust_scores_insert ON brain.trust_scores;
DROP POLICY IF EXISTS brain_trust_scores_update ON brain.trust_scores;
CREATE POLICY brain_trust_scores_insert ON brain.trust_scores FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY brain_trust_scores_update ON brain.trust_scores FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- =========================
-- public.* admin-only tables (all .from() callers verified to use service_role)
-- =========================

DROP POLICY IF EXISTS "Admins can do everything on audit_share_links" ON public.audit_share_links;
CREATE POLICY audit_share_links_admin_all ON public.audit_share_links FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can do everything on ecom_competitors" ON public.ecom_competitors;
CREATE POLICY ecom_competitors_admin_all ON public.ecom_competitors FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can do everything on ecom_snapshots" ON public.ecom_snapshots;
CREATE POLICY ecom_snapshots_admin_all ON public.ecom_snapshots FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can do everything on meta_ad_creatives" ON public.meta_ad_creatives;
CREATE POLICY meta_ad_creatives_admin_all ON public.meta_ad_creatives FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can do everything on meta_ad_tracked_pages" ON public.meta_ad_tracked_pages;
CREATE POLICY meta_ad_tracked_pages_admin_all ON public.meta_ad_tracked_pages FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can do everything on prospect_audits" ON public.prospect_audits;
CREATE POLICY prospect_audits_admin_all ON public.prospect_audits FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins full access on topic_search_videos" ON public.topic_search_videos;
CREATE POLICY topic_search_videos_admin_all ON public.topic_search_videos FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- activity_log: insert was permissive; tighten to admin
DROP POLICY IF EXISTS "Authenticated users can insert activity" ON public.activity_log;
CREATE POLICY activity_log_admin_insert ON public.activity_log FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- post_review_comments: anyone could insert; tighten to admin (all share-flow inserts go via service_role)
DROP POLICY IF EXISTS "Anyone can insert review comments" ON public.post_review_comments;
CREATE POLICY post_review_comments_admin_insert ON public.post_review_comments FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- submissions: insert had WITH CHECK true; no callers; restrict to admin
DROP POLICY IF EXISTS submissions_insert ON public.submissions;
CREATE POLICY submissions_admin_insert ON public.submissions FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- matchups: insert had WITH CHECK true; record_vote() uses SECURITY DEFINER and bypasses caller RLS; restrict to admin
DROP POLICY IF EXISTS matchups_insert ON public.matchups;
CREATE POLICY matchups_admin_insert ON public.matchups FOR INSERT TO authenticated WITH CHECK (public.is_admin());
