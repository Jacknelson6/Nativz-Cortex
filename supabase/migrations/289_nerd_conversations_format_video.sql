-- ============================================================
-- VFF-10: Wire format pin into nerd_conversations
-- ============================================================
-- Note: migration 288 (VFF-09) already added format_video_id during
-- the dismissals migration so we could pin a conversation as part of
-- the use-in-content-lab handoff before VFF-10 shipped. This
-- migration is idempotent and is the canonical source of truth for
-- the column; it also runs the metadata->column backfill in case any
-- early stubs used metadata jsonb.

ALTER TABLE nerd_conversations
  ADD COLUMN IF NOT EXISTS format_video_id UUID
    REFERENCES viral_videos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nerd_conversations_format_video
  ON nerd_conversations(format_video_id)
  WHERE format_video_id IS NOT NULL;

-- Backfill: if any conversation was created with metadata.format_video_id
-- (VFF-09 stub fallback path) but the typed column is still null,
-- migrate it across. metadata column may not exist on this table; the
-- `DO` block lets us skip the UPDATE gracefully if it doesn't.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nerd_conversations'
      AND column_name = 'metadata'
  ) THEN
    UPDATE nerd_conversations
       SET format_video_id = (metadata->>'format_video_id')::uuid
     WHERE format_video_id IS NULL
       AND metadata ? 'format_video_id'
       AND (metadata->>'format_video_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-';
  END IF;
END $$;
