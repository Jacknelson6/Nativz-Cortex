-- ──────────────────────────────────────────────────────────────────────
-- 188: Track every open of a content-calendar share link
-- ──────────────────────────────────────────────────────────────────────
-- We already update content_drop_share_links.last_viewed_at on each GET,
-- but that loses history (when, who, how often). Admins want to see the
-- full open log per share link to gauge client engagement and drive
-- reminder cadence (e.g., nudge after 48h with no opens).
--
-- viewer_name comes from a `?as=<name>` query param on /api/calendar/share/[token]
-- which the public viewer page (/c/[token]) attaches once the reviewer has
-- entered their name (stored in localStorage). user_agent is captured raw
-- so we can show "iPhone / Mac / Chrome" cues in the admin UI.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_drop_share_link_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id uuid NOT NULL REFERENCES content_drop_share_links(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  viewer_name text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_share_link_views_link
  ON content_drop_share_link_views (share_link_id, viewed_at DESC);

ALTER TABLE content_drop_share_link_views ENABLE ROW LEVEL SECURITY;

-- Admins can read the log; inserts come from the service-role API route.
CREATE POLICY "admins can read share-link views"
  ON content_drop_share_link_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'super_admin')
    )
  );
