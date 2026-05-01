-- Migration 218: Per-platform post overrides
--
-- Background: Zernio's POST /v1/posts request takes platform-specific
-- payloads inside `platforms[].platformSpecificData`. Today we hardcode
-- those values inside `lib/posting/zernio.ts` (`buildPublishBody`):
--
--   - YouTube `title` falls back to the first line of the caption,
--     truncated to 100 chars. That's a fine default but produces
--     garbage when the caption opens with a hashtag burst or emoji.
--     YouTube also has `description`, `tags`, and `privacy` knobs we
--     never expose.
--   - TikTok `allow_comment`, `allow_duet`, `allow_stitch` are all
--     locked to `true`. Some clients (regulated industries, brand-safe
--     channels) explicitly want comments off or duet/stitch disabled.
--   - Instagram `shareToFeed: true` is locked on; some clients only
--     want the Reel without it cross-posting to the grid.
--
-- Storing these per `scheduled_posts` row keeps the model simple: the
-- scheduler UI edits the same row that the cron publishes from. NULLs
-- mean "use Zernio defaults / caption-derived title" so existing posts
-- keep working.
--
-- Note: TikTok `privacy_level` and `content_preview_confirmed` /
-- `express_consent_given` are intentionally left hardcoded — they're
-- not user-facing knobs, just protocol requirements.
--
-- See `lib/posting/zernio.ts` `buildPublishBody` for how these flow
-- into the publish request, and the SafeStop incident write-up for
-- why per-post platform config matters (YouTube was shipping with the
-- caption's first line, not a real title).

ALTER TABLE scheduled_posts
  ADD COLUMN IF NOT EXISTS youtube_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS youtube_description TEXT NULL,
  ADD COLUMN IF NOT EXISTS youtube_tags TEXT[] NULL,
  ADD COLUMN IF NOT EXISTS youtube_privacy TEXT NULL
    CHECK (youtube_privacy IS NULL OR youtube_privacy IN ('public', 'unlisted', 'private')),
  ADD COLUMN IF NOT EXISTS youtube_made_for_kids BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS tiktok_allow_comment BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS tiktok_allow_duet BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS tiktok_allow_stitch BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS instagram_share_to_feed BOOLEAN NULL;

COMMENT ON COLUMN scheduled_posts.youtube_title IS
  'Override for YouTube video title (max 100 chars). NULL = derive from caption first line, current default behavior in lib/posting/zernio.ts.';
COMMENT ON COLUMN scheduled_posts.youtube_description IS
  'Override for YouTube description. NULL = use shared caption.';
COMMENT ON COLUMN scheduled_posts.youtube_tags IS
  'YouTube-specific tags. NULL = use shared hashtags as tags.';
COMMENT ON COLUMN scheduled_posts.youtube_privacy IS
  'public | unlisted | private. NULL = public.';
COMMENT ON COLUMN scheduled_posts.youtube_made_for_kids IS
  'Made-for-kids flag for YouTube COPPA compliance. NULL = false.';
COMMENT ON COLUMN scheduled_posts.tiktok_allow_comment IS
  'Allow comments on TikTok post. NULL = true.';
COMMENT ON COLUMN scheduled_posts.tiktok_allow_duet IS
  'Allow duets on TikTok post. NULL = true.';
COMMENT ON COLUMN scheduled_posts.tiktok_allow_stitch IS
  'Allow stitches on TikTok post. NULL = true.';
COMMENT ON COLUMN scheduled_posts.instagram_share_to_feed IS
  'Cross-post Reel to Instagram feed. NULL = true.';
