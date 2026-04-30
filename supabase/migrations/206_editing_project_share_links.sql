-- Migration 206: Public review share links for editing projects
--
-- Mirrors content_drop_share_links + content_drop_share_link_views, but
-- scoped to editing projects (which carry only videos, no captions /
-- schedule / platforms). One token unlocks a public branded review page
-- at /c/edit/<token> showing every cut on the project.
--
-- Decision: separate tables instead of overloading the social-drops
-- share schema. The public page rendering is materially different (no
-- captions, no scheduling, no per-post review status), and reusing
-- `included_post_ids` / `post_review_link_map` would require the
-- editing-project flow to fabricate fake content_drop rows just to
-- satisfy NOT NULL FKs. Keeping it isolated is cheaper.
--
-- View tracking matches the social pattern (separate child table) so we
-- can later show "viewed by X people, last on Y" without bumping a
-- denormalised counter on every hit.

CREATE TABLE IF NOT EXISTS editing_project_share_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES editing_projects(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  last_viewed_at  TIMESTAMPTZ NULL,
  archived_at     TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS editing_project_share_links_project_idx
  ON editing_project_share_links (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS editing_project_share_links_token_idx
  ON editing_project_share_links (token);

CREATE TABLE IF NOT EXISTS editing_project_share_link_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id   UUID NOT NULL REFERENCES editing_project_share_links(id) ON DELETE CASCADE,
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  viewer_name     TEXT NULL,
  ip              TEXT NULL,
  user_agent      TEXT NULL
);

CREATE INDEX IF NOT EXISTS editing_project_share_link_views_link_idx
  ON editing_project_share_link_views (share_link_id, viewed_at DESC);

ALTER TABLE editing_project_share_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE editing_project_share_link_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS editing_project_share_links_admin_all ON editing_project_share_links;
CREATE POLICY editing_project_share_links_admin_all ON editing_project_share_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  );

DROP POLICY IF EXISTS editing_project_share_link_views_admin_all ON editing_project_share_link_views;
CREATE POLICY editing_project_share_link_views_admin_all ON editing_project_share_link_views
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND (users.role IN ('admin', 'super_admin') OR users.is_super_admin = true)
    )
  );

COMMENT ON TABLE editing_project_share_links IS
  'Public review-page tokens for editing projects. One row per minted link; /c/edit/<token> resolves to a branded grid of the project''s edited cuts. Mirrors content_drop_share_links but lives in its own table because editing projects have no captions / schedule / platforms.';
COMMENT ON TABLE editing_project_share_link_views IS
  'Append-only view log for editing project share links. Driven by the public page on first paint to power "viewed by X people" + last-viewed timestamps.';
