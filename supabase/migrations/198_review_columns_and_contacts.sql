-- 198_review_columns_and_contacts.sql
--
-- Review-surface columns: each share link gets an optional admin-edited
-- project name, a project type (social_ads / ctv_ads / organic_content /
-- other), and an `abandoned_at` so admins can mark a calendar dead
-- without expiring the token. The UI falls back to a derived name
-- (latter-month rule, e.g. "May 2026 Content Calendar") when `name` is
-- NULL.
--
-- Plus a per-brand `content_drop_review_contacts` table — the agency's
-- POC list for each client. Drives the "Notifications" subpage on
-- /review where admins (and the brand's own viewers) can add contacts,
-- toggle notifications per person, and set follow-up cadence.

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS name TEXT NULL,
  ADD COLUMN IF NOT EXISTS project_type TEXT NULL
    CHECK (project_type IS NULL OR project_type IN
      ('social_ads', 'ctv_ads', 'organic_content', 'other')),
  ADD COLUMN IF NOT EXISTS project_type_other TEXT NULL,
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN content_drop_share_links.name IS
  'Optional admin-edited project name. When NULL, the UI derives a name '
  'from the drop month range (latter month — "May 2026 Content Calendar" '
  'for an Apr–May window).';

COMMENT ON COLUMN content_drop_share_links.project_type IS
  'Project category for filtering and reporting. NULL means "unspecified" '
  'and renders as a dash in the table.';

COMMENT ON COLUMN content_drop_share_links.project_type_other IS
  'Free-text label when project_type = ''other''. Capped to 60 chars in '
  'the API.';

COMMENT ON COLUMN content_drop_share_links.abandoned_at IS
  'When set, the calendar is treated as Abandoned in the review surface — '
  'red status pill, dimmed row. Independent of expires_at so a calendar '
  'can be killed early without revoking the token.';

-- ---------------------------------------------------------------------
-- Review notification contacts (per-brand POC list).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS content_drop_review_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT,
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  followup_cadence TEXT NOT NULL DEFAULT 'every_3_days'
    CHECK (followup_cadence IN ('off', 'daily', 'every_3_days', 'weekly', 'biweekly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, email)
);

CREATE INDEX IF NOT EXISTS idx_review_contacts_client
  ON content_drop_review_contacts (client_id);

ALTER TABLE content_drop_review_contacts ENABLE ROW LEVEL SECURITY;

-- Admins: full access.
DROP POLICY IF EXISTS "admin_all_review_contacts" ON content_drop_review_contacts;
CREATE POLICY "admin_all_review_contacts" ON content_drop_review_contacts FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.role IN ('admin', 'super_admin')));

-- Viewers: can see + manage contacts for clients they have access to.
DROP POLICY IF EXISTS "viewer_read_review_contacts" ON content_drop_review_contacts;
CREATE POLICY "viewer_read_review_contacts" ON content_drop_review_contacts FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_client_access uca
                 WHERE uca.user_id = auth.uid()
                 AND uca.client_id = content_drop_review_contacts.client_id));

DROP POLICY IF EXISTS "viewer_modify_review_contacts" ON content_drop_review_contacts;
CREATE POLICY "viewer_modify_review_contacts" ON content_drop_review_contacts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_client_access uca
                 WHERE uca.user_id = auth.uid()
                 AND uca.client_id = content_drop_review_contacts.client_id));

DROP POLICY IF EXISTS "viewer_insert_review_contacts" ON content_drop_review_contacts;
CREATE POLICY "viewer_insert_review_contacts" ON content_drop_review_contacts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_client_access uca
                      WHERE uca.user_id = auth.uid()
                      AND uca.client_id = content_drop_review_contacts.client_id));

-- updated_at touch trigger (tiny, inline so we don't depend on a shared
-- "moddatetime" extension).
CREATE OR REPLACE FUNCTION touch_review_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_review_contacts_updated_at ON content_drop_review_contacts;
CREATE TRIGGER trg_review_contacts_updated_at
  BEFORE UPDATE ON content_drop_review_contacts
  FOR EACH ROW EXECUTE FUNCTION touch_review_contacts_updated_at();
