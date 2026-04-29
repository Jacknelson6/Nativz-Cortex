-- Migration 199: Editable per-post title for ad/other share-link types
--
-- Organic content uses caption + hashtags; ad-type and "other" projects
-- (Social Ads, CTV Ads, Other) hide those and instead show a per-creative
-- title that defaults to the uploaded filename. We store the title on
-- scheduled_posts because the share API already iterates that row per
-- creative — same shape as caption.

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS title TEXT NULL;

COMMENT ON COLUMN scheduled_posts.title IS
  'Editable display title for share-link viewers. Defaults to NULL; the share UI falls back to the underlying creative filename. Used for Social Ads, CTV Ads, and Other project types where caption is hidden.';
