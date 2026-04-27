-- Storage buckets for the content calendar pipeline.
-- Migration 012 created these on the dev project, but it was never applied here.
-- lib/calendar/storage-upload.ts writes to scheduler-media (videos) and
-- scheduler-thumbnails (jpgs) using createAdminClient() which bypasses RLS,
-- so we only need the buckets to exist and be public for getPublicUrl().

INSERT INTO storage.buckets (id, name, public)
VALUES ('scheduler-media', 'scheduler-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('scheduler-thumbnails', 'scheduler-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Public read so video_url / thumbnail_url work for the share-link UI and
-- for portal viewers without signed URLs.
DROP POLICY IF EXISTS "Public read scheduler media" ON storage.objects;
CREATE POLICY "Public read scheduler media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'scheduler-media');

DROP POLICY IF EXISTS "Public read scheduler thumbnails" ON storage.objects;
CREATE POLICY "Public read scheduler thumbnails"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'scheduler-thumbnails');
