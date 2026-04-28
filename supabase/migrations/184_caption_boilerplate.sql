-- Per-client caption boilerplate appended to every generated caption.
-- caption_cta: trailing call-to-action paragraph (rendered as its own block).
-- caption_hashtags: tags appended after CTA, no leading "#".
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS caption_cta TEXT,
  ADD COLUMN IF NOT EXISTS caption_hashtags TEXT[] DEFAULT '{}';
