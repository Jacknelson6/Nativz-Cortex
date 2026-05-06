-- Migration 255: Per-platform routing overrides (Zernio shape parity)
--
-- Background: docs/zernio-platform-shapes.md (snapshotted 2026-05-06) is the
-- canonical reference for Zernio's POST /v1/posts shape. The codebase's
-- per-platform routers in `lib/posting/zernio.ts` already accept these knobs
-- on `PublishPostInput` (added 2026-05-06):
--
--   * `instagramContentType`        — force feed / reels / story
--   * `facebookContentType`         — force reel / story (default = auto)
--   * `facebookPageId`              — target a specific FB page when the
--                                     account manages multiple
--   * `linkedinDocumentTitle`       — REQUIRED for LinkedIn document posts
--                                     (PDF / PPT / DOCX); LinkedIn rejects
--                                     document uploads without it
--   * `linkedinOrganizationUrn`     — post as a company page rather than
--                                     a personal profile
--   * `linkedinDisableLinkPreview`  — suppress auto preview card on text
--                                     posts that contain a URL
--   * `firstComment`                — pinned first comment, fans out to
--                                     IG (feed/carousel/reels), FB (feed/
--                                     reel), LinkedIn, YouTube
--
-- Migration 218 added the YouTube / TikTok / IG share-to-feed columns. This
-- migration completes the set so every override exposed on PublishPostInput
-- has a place to live on `scheduled_posts`. NULL still means "use the router
-- default" so existing posts keep working unchanged.
--
-- Note on `tagged_people`: Zernio docs name the field `userTags` and expect
-- objects (`{username, x, y, mediaIndex?}`). We stopped sending the bare-
-- string `usersToTag` in lib/posting/zernio.ts on 2026-05-06 because Zernio
-- silently dropped it. The `tagged_people` column stays for forward-compat
-- when we add tap-to-tag UI; it's no longer wired into the publish payload.
--
-- See `docs/zernio-platform-shapes.md` for the field tables and required/
-- optional rules.

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS instagram_content_type TEXT NULL
    CHECK (instagram_content_type IS NULL
           OR instagram_content_type IN ('feed', 'reels', 'story')),
  ADD COLUMN IF NOT EXISTS facebook_content_type TEXT NULL
    CHECK (facebook_content_type IS NULL
           OR facebook_content_type IN ('feed', 'reel', 'story')),
  ADD COLUMN IF NOT EXISTS facebook_page_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS linkedin_document_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS linkedin_organization_urn TEXT NULL,
  ADD COLUMN IF NOT EXISTS linkedin_disable_link_preview BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS first_comment TEXT NULL;

COMMENT ON COLUMN scheduled_posts.instagram_content_type IS
  'Forces IG variant. NULL = auto (image-only → feed, video → reels). Use ''story'' to publish a 9:16 image as a Story (only legal home for that aspect ratio).';
COMMENT ON COLUMN scheduled_posts.facebook_content_type IS
  'Forces FB variant. NULL = auto (Zernio routes feed-image / feed-video). Use ''reel'' for vertical video Reels, ''story'' for 24h stories.';
COMMENT ON COLUMN scheduled_posts.facebook_page_id IS
  'Target FB page id when the connected account manages multiple pages. NULL = Zernio''s default page selection.';
COMMENT ON COLUMN scheduled_posts.linkedin_document_title IS
  'REQUIRED by LinkedIn for PDF / PPT / DOCX posts. Falls back to media item title / filename in lib/posting/zernio.ts when omitted.';
COMMENT ON COLUMN scheduled_posts.linkedin_organization_urn IS
  'Format: urn:li:organization:123456. Posts as a company page rather than the personal profile.';
COMMENT ON COLUMN scheduled_posts.linkedin_disable_link_preview IS
  'Suppress LinkedIn''s auto URL preview card on text-only posts containing an inline link. Ignored for posts with media.';
COMMENT ON COLUMN scheduled_posts.first_comment IS
  'Auto-posted as the pinned first comment after publish. Fans out to IG (feed/carousel/reels), FB (feed/reel), LinkedIn, YouTube. Stories drop it. Useful for parking external URLs (LinkedIn down-ranks link posts ~40-50%).';
