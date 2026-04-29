-- Caption boilerplate language variants.
--   caption_cta_es: Spanish CTA used when a video is detected as Spanish.
--   caption_hashtags_es: Spanish hashtag set, ditto.
-- The base caption_cta / caption_hashtags remain the default (English) and
-- act as the fallback for any non-Spanish detected language.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS caption_cta_es TEXT,
  ADD COLUMN IF NOT EXISTS caption_hashtags_es TEXT[] DEFAULT '{}';

-- Per-video detected language (BCP-47 lowercase, e.g. "en", "es"). Set by
-- the analyzer step from Gemini's spoken-text + on-screen-text inspection.
-- Defaults to 'en' so legacy rows behave as before.
ALTER TABLE content_drop_videos
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
