-- ============================================================
-- Migration: Security Hardening (Supabase Linter Fixes)
-- Date: 2026-04-03
-- Fixes: RLS disabled tables, overly permissive policies,
--        function search_path, leaked password protection
-- ============================================================

-- Helper: reusable admin check
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'
  );
$$;

-- ============================================================
-- PART 1: Enable RLS on tables that had it disabled (ERROR level)
-- ============================================================

-- These tables were completely exposed via PostgREST API with zero auth.

ALTER TABLE public.vault_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodboard_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodboard_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodboard_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodboard_item_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nerd_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nerd_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_seed_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_search_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_search_hooks ENABLE ROW LEVEL SECURITY;

-- vault_documents: admin-only (internal vault content)
CREATE POLICY "Admin full access on vault_documents"
  ON public.vault_documents FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- moodboard_share_links: admin can manage, anon can read by token (handled by app)
CREATE POLICY "Admin full access on moodboard_share_links"
  ON public.moodboard_share_links FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- moodboard_edges: authenticated users (admin-only tool)
CREATE POLICY "Authenticated users can manage moodboard_edges"
  ON public.moodboard_edges FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- moodboard_tags: authenticated users (admin-only tool)
CREATE POLICY "Authenticated users can manage moodboard_tags"
  ON public.moodboard_tags FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- moodboard_item_tags: authenticated users (admin-only tool)
CREATE POLICY "Authenticated users can manage moodboard_item_tags"
  ON public.moodboard_item_tags FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- agency_settings: admin-only config
CREATE POLICY "Admin full access on agency_settings"
  ON public.agency_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
-- All authenticated can read agency settings
CREATE POLICY "Authenticated users can read agency_settings"
  ON public.agency_settings FOR SELECT TO authenticated
  USING (true);

-- search_share_links: admin manages, tokens accessed via app (service role)
CREATE POLICY "Admin full access on search_share_links"
  ON public.search_share_links FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- nerd_conversations: admin-only AI chat
CREATE POLICY "Admin full access on nerd_conversations"
  ON public.nerd_conversations FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- nerd_messages: admin-only AI chat messages
CREATE POLICY "Admin full access on nerd_messages"
  ON public.nerd_messages FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- schema_migrations: nobody needs API access, service role only
CREATE POLICY "No public access to schema_migrations"
  ON public.schema_migrations FOR ALL
  USING (false);

-- workspace_seed_suppressions: admin-only internal
CREATE POLICY "Admin full access on workspace_seed_suppressions"
  ON public.workspace_seed_suppressions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- topic_search_videos: same pattern as topic_searches
CREATE POLICY "Admin full access on topic_search_videos"
  ON public.topic_search_videos FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- topic_search_hooks: same pattern as topic_searches
CREATE POLICY "Admin full access on topic_search_hooks"
  ON public.topic_search_hooks FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- PART 2: Fix overly permissive RLS policies (WARN level)
-- Replace "USING (true)" with admin-only for admin tables,
-- leave intentionally public ones alone.
-- ============================================================

-- DECISION LOGIC:
-- Tables that are admin-only internal tools: tighten to is_admin()
-- Tables clients interact with via portal: keep authenticated but scope later
-- Tables that genuinely need open insert (post_review_comments, matchups, submissions): KEEP as-is
--   These are public-facing features where anonymous/any-user inserts are intentional.

-- ad_creatives: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage ad_creatives" ON public.ad_creatives;
CREATE POLICY "Admin full access on ad_creatives"
  ON public.ad_creatives FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ad_generation_batches: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage ad_generation_batches" ON public.ad_generation_batches;
CREATE POLICY "Admin full access on ad_generation_batches"
  ON public.ad_generation_batches FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ad_library_scrape_jobs: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage scrape jobs" ON public.ad_library_scrape_jobs;
CREATE POLICY "Admin full access on ad_library_scrape_jobs"
  ON public.ad_library_scrape_jobs FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ad_prompt_templates: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage ad_prompt_templates" ON public.ad_prompt_templates;
CREATE POLICY "Admin full access on ad_prompt_templates"
  ON public.ad_prompt_templates FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- brand_dna_jobs: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage brand_dna_jobs" ON public.brand_dna_jobs;
CREATE POLICY "Admin full access on brand_dna_jobs"
  ON public.brand_dna_jobs FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- client_ad_generation_settings: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage client_ad_generation_settings" ON public.client_ad_generation_settings;
CREATE POLICY "Admin full access on client_ad_generation_settings"
  ON public.client_ad_generation_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- client_review_links: admin-only (admins generate review links for clients)
DROP POLICY IF EXISTS "Authenticated users can manage client_review_links" ON public.client_review_links;
CREATE POLICY "Admin full access on client_review_links"
  ON public.client_review_links FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- content_pipeline: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage pipeline" ON public.content_pipeline;
CREATE POLICY "Admin full access on content_pipeline"
  ON public.content_pipeline FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- activity_log: admin can read all, any authenticated can insert (intentional - logging)
-- KEEP insert as-is, it's a write-only audit trail
-- No change needed - INSERT with true for authenticated is fine for logging

-- idea_generations: tighten the "-" role (public) to admin only
DROP POLICY IF EXISTS "Admin full access on idea_generations" ON public.idea_generations;
CREATE POLICY "Admin full access on idea_generations"
  ON public.idea_generations FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- meetings: admin-only (internal team meetings)
DROP POLICY IF EXISTS "Authenticated users can delete meetings" ON public.meetings;
DROP POLICY IF EXISTS "Authenticated users can insert meetings" ON public.meetings;
DROP POLICY IF EXISTS "Authenticated users can update meetings" ON public.meetings;
CREATE POLICY "Admin full access on meetings"
  ON public.meetings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
-- Keep existing SELECT policy if any (authenticated users can read meetings)
DROP POLICY IF EXISTS "Authenticated users can read meetings" ON public.meetings;
CREATE POLICY "Authenticated users can read meetings"
  ON public.meetings FOR SELECT TO authenticated
  USING (true);

-- moodboard_boards: admin-only (internal creative tool)
DROP POLICY IF EXISTS "Authenticated users can manage boards" ON public.moodboard_boards;
CREATE POLICY "Admin full access on moodboard_boards"
  ON public.moodboard_boards FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- moodboard_comments: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage comments" ON public.moodboard_comments;
CREATE POLICY "Admin full access on moodboard_comments"
  ON public.moodboard_comments FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- moodboard_items: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage items" ON public.moodboard_items;
CREATE POLICY "Admin full access on moodboard_items"
  ON public.moodboard_items FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- moodboard_notes: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage notes" ON public.moodboard_notes;
CREATE POLICY "Admin full access on moodboard_notes"
  ON public.moodboard_notes FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- platform_snapshots: admin-only (analytics)
DROP POLICY IF EXISTS "Authenticated users can manage platform_snapshots" ON public.platform_snapshots;
CREATE POLICY "Admin full access on platform_snapshots"
  ON public.platform_snapshots FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- post_metrics: admin-only (analytics)
DROP POLICY IF EXISTS "Authenticated users can manage post_metrics" ON public.post_metrics;
CREATE POLICY "Admin full access on post_metrics"
  ON public.post_metrics FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- post_review_comments: KEEP AS-IS
-- This is intentionally public (anon + authenticated can insert review comments).
-- Clients use share links to leave comments without logging in.

-- post_review_links: admin-only (admin generates review links)
DROP POLICY IF EXISTS "Authenticated users can manage post_review_links" ON public.post_review_links;
CREATE POLICY "Admin full access on post_review_links"
  ON public.post_review_links FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- report_links: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage report_links" ON public.report_links;
CREATE POLICY "Admin full access on report_links"
  ON public.report_links FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- saved_captions: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage saved_captions" ON public.saved_captions;
CREATE POLICY "Admin full access on saved_captions"
  ON public.saved_captions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- scheduled_post_media: admin-only (scheduler)
DROP POLICY IF EXISTS "Authenticated users can manage scheduled_post_media" ON public.scheduled_post_media;
CREATE POLICY "Admin full access on scheduled_post_media"
  ON public.scheduled_post_media FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- scheduled_post_platforms: admin-only (scheduler)
DROP POLICY IF EXISTS "Authenticated users can manage scheduled_post_platforms" ON public.scheduled_post_platforms;
CREATE POLICY "Admin full access on scheduled_post_platforms"
  ON public.scheduled_post_platforms FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- scheduler_media: admin-only
DROP POLICY IF EXISTS "Authenticated users can manage scheduler_media" ON public.scheduler_media;
CREATE POLICY "Admin full access on scheduler_media"
  ON public.scheduler_media FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- social_profiles: admin-only (connected social accounts)
DROP POLICY IF EXISTS "Authenticated users can manage social_profiles" ON public.social_profiles;
CREATE POLICY "Admin full access on social_profiles"
  ON public.social_profiles FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- submissions: KEEP AS-IS
-- Public insert is intentional (easter egg / public submission form)

-- matchups: KEEP AS-IS
-- Public insert is intentional (voting feature)

-- task_activity: admin-only (internal task management)
DROP POLICY IF EXISTS "Authenticated users can manage task activity" ON public.task_activity;
CREATE POLICY "Admin full access on task_activity"
  ON public.task_activity FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- tasks: admin-only (internal task management)
DROP POLICY IF EXISTS "Authenticated users can manage tasks" ON public.tasks;
CREATE POLICY "Admin full access on tasks"
  ON public.tasks FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- PART 3: Fix function search_path (WARN level)
-- Set search_path on all flagged functions to prevent
-- search_path injection attacks.
-- We use ALTER FUNCTION ... SET search_path = public;
-- since we can't CREATE OR REPLACE without the full body.
-- ============================================================

-- Note: ALTER FUNCTION SET search_path works on existing functions
-- without needing to know the full function body.

DO $$
DECLARE
  func_record RECORD;
  func_names TEXT[] := ARRAY[
    'search_vault_fts',
    'search_vault_semantic',
    'record_vote',
    'update_postara_updated_at',
    'search_knowledge_entries',
    'handle_updated_at',
    'update_updated_at_column',
    'search_knowledge_semantic',
    'search_knowledge_fts',
    'search_knowledge_global',
    'set_updated_at',
    'search_knowledge_nodes',
    'search_knowledge_nodes_fts',
    'get_current_knowledge',
    'get_knowledge_history'
  ];
  fname TEXT;
BEGIN
  FOREACH fname IN ARRAY func_names LOOP
    FOR func_record IN
      SELECT p.oid, p.proname,
             pg_catalog.pg_get_function_identity_arguments(p.oid) as args
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fname
    LOOP
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public',
        func_record.proname,
        func_record.args
      );
      RAISE NOTICE 'Fixed search_path for: public.%(%)', func_record.proname, func_record.args;
    END LOOP;
  END LOOP;
END $$;


-- ============================================================
-- PART 4: Extension in public schema (WARN level)
-- SKIP: Moving the vector extension out of public is risky.
-- It would break every function that references the vector type
-- without a schema prefix. This is a known Supabase lint that
-- most projects safely ignore. Fix later when refactoring.
-- ============================================================

-- ============================================================
-- PART 5: Leaked password protection (WARN level)
-- This must be enabled in the Supabase Dashboard, not via SQL.
-- Go to: Authentication > Settings > Password protection
-- Toggle ON "Check passwords against HaveIBeenPwned"
-- ============================================================
