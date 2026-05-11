-- ============================================================
-- Migration: Drop legacy postara_posts table
-- Date: 2026-05-10
--
-- The "postara_posts" table is a remnant from the legacy
-- Postara naming (current social posting integration is Zernio,
-- see scheduled_posts + scheduled_post_platforms). The table has
-- zero rows, zero foreign keys, and zero code references.
-- Migration 041 dropped the related update_postara_updated_at
-- trigger function but left this orphan table in place.
-- ============================================================

DROP TABLE IF EXISTS public.postara_posts CASCADE;
