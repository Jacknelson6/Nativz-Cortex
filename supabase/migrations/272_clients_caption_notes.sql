-- 272_clients_caption_notes.sql
--
-- NAT-67: free-text guidance fields the strategist fills in once per
-- brand so AI caption generation has real context (voice, hook style,
-- branded vs banned hashtags, default CTA copy + variants) instead of
-- generic AI fluff. Distinct from the existing structured boilerplate
-- columns:
--   caption_cta        - exact text appended verbatim to every caption
--   caption_hashtags   - exact tags appended verbatim to every caption
-- The new *_notes columns are *prompt context*, not appended output —
-- they shape what the model writes, the boilerplate columns are the
-- literal trailing text.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS caption_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS hashtag_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS cta_notes     TEXT NULL;

COMMENT ON COLUMN clients.caption_notes IS
  'NAT-67: free-text strategist guidance for caption generation - voice, structure, banned phrases, hook style. Flows into the AI prompt for content-calendar caption generation.';
COMMENT ON COLUMN clients.hashtag_notes IS
  'NAT-67: free-text strategist guidance on hashtag strategy - branded tags, banned tags, regional/niche set, count preferences. Flows into the AI prompt.';
COMMENT ON COLUMN clients.cta_notes IS
  'NAT-67: free-text strategist guidance on CTA strategy - default copy, link destinations, A/B variants. Flows into the AI prompt; not appended literally (use caption_cta for that).';
