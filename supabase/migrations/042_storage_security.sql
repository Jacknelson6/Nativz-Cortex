-- Fix overly permissive storage policies on scheduler-media and scheduler-thumbnails buckets.
-- Scope write/update/delete to user's own folder (auth.uid()::text prefix).
-- Keep public reads intact.

-- ============================================================
-- scheduler-media bucket
-- ============================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload scheduler media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update scheduler media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete scheduler media" ON storage.objects;
DROP POLICY IF EXISTS "Public read scheduler media" ON storage.objects;

-- Users can only INSERT into their own folder
CREATE POLICY "Users can upload to own scheduler-media folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'scheduler-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can only UPDATE files in their own folder
CREATE POLICY "Users can update own scheduler-media files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'scheduler-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can only DELETE files in their own folder
CREATE POLICY "Users can delete own scheduler-media files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'scheduler-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read remains open (bucket serves media publicly)
CREATE POLICY "Public read scheduler media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'scheduler-media');

-- ============================================================
-- scheduler-thumbnails bucket
-- ============================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload scheduler thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete scheduler thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Public read scheduler thumbnails" ON storage.objects;

-- Users can only INSERT into their own folder
CREATE POLICY "Users can upload to own scheduler-thumbnails folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'scheduler-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can only DELETE files in their own folder
CREATE POLICY "Users can delete own scheduler-thumbnails files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'scheduler-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read remains open
CREATE POLICY "Public read scheduler thumbnails"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'scheduler-thumbnails');
