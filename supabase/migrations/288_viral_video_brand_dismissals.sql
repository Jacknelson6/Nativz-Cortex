-- ============================================================
-- VFF-09: Per-brand dismissal feedback + Content Lab handoff column
-- ============================================================
--
-- 1. viral_video_brand_dismissals: a strategist can mark a video
--    "not for this brand" without removing it from the global pool;
--    the format feed (lib/analytics/format-feed.ts) LEFT JOINs this
--    table so dismissed videos demote (sort to the end) instead of
--    disappearing entirely. PK on (video_id, client_id) makes a re-
--    dismiss idempotent.
--
-- 2. nerd_conversations.format_video_id: when the strategist clicks
--    "Use this format" in the detail view, we open a new Content Lab
--    conversation pinned to the source viral_video. VFF-10 reads this
--    column to augment the system prompt; for VFF-09 we just write it.
--
-- Additive only. No backfill needed.

CREATE TABLE IF NOT EXISTS viral_video_brand_dismissals (
  video_id UUID NOT NULL REFERENCES viral_videos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  dismissed_by UUID REFERENCES auth.users(id),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  PRIMARY KEY (video_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_dismissals_client
  ON viral_video_brand_dismissals(client_id);

ALTER TABLE viral_video_brand_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dismissals_admin_all ON viral_video_brand_dismissals;
CREATE POLICY dismissals_admin_all ON viral_video_brand_dismissals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin','super_admin') OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin','super_admin') OR users.is_super_admin = true)
    )
  );

COMMENT ON TABLE viral_video_brand_dismissals IS
  'Strategist marks a viral_video as off-brand for a specific client. Feed query LEFT JOINs and sorts dismissed rows to the end. PK makes re-dismiss idempotent; UPSERT in app code refreshes dismissed_at + reason.';

-- ============================================================
-- nerd_conversations.format_video_id: track the source viral_video
-- when a conversation was started via "Use this format" in VFF-09.
-- ============================================================

ALTER TABLE nerd_conversations
  ADD COLUMN IF NOT EXISTS format_video_id UUID REFERENCES viral_videos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nerd_conversations_format_video
  ON nerd_conversations(format_video_id)
  WHERE format_video_id IS NOT NULL;

COMMENT ON COLUMN nerd_conversations.format_video_id IS
  'When the conversation was opened via the VFF "Use this format" CTA, this points to the source viral_video so VFF-10 can augment the system prompt with the format breakdown.';
