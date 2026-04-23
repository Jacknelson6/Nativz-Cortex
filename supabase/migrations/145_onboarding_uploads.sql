-- 145_onboarding_uploads.sql — client-uploaded assets on the public page
-- ----------------------------------------------------------------------------
-- Clients drag files into the public /onboarding/[slug] page; each upload
-- gets a row here plus an object in the private `onboarding-uploads` bucket.
-- Admin sees all uploads in the tracker editor with signed download links.
--
-- RLS: admins all. Public clients never touch this table or bucket directly —
-- they hit /api/onboarding/public/upload* routes that proxy through the
-- service-role client after share_token validation.

CREATE TABLE IF NOT EXISTS onboarding_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracker_id UUID NOT NULL REFERENCES onboarding_trackers(id) ON DELETE CASCADE,
  -- storage path inside the bucket, e.g. onboarding/<tracker_id>/<uuid>-<name>
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  -- Optional phase link for \u201cthis upload fulfils THIS phase\u201d flows later.
  phase_id UUID REFERENCES onboarding_phases(id) ON DELETE SET NULL,
  -- Opaque note from the client (\u201chere's our brand guide\u201d).
  note TEXT,
  uploaded_by TEXT NOT NULL DEFAULT 'client' CHECK (uploaded_by IN ('client', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_uploads_tracker_idx
  ON onboarding_uploads (tracker_id, created_at DESC);

ALTER TABLE onboarding_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_uploads admin all" ON onboarding_uploads;
CREATE POLICY "onboarding_uploads admin all"
  ON onboarding_uploads FOR ALL
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Private bucket. Service-role only; signed URLs for download.
INSERT INTO storage.buckets (id, name, public)
VALUES ('onboarding-uploads', 'onboarding-uploads', false)
ON CONFLICT (id) DO NOTHING;
