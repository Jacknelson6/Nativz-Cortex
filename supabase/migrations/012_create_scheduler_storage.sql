-- Storage buckets for scheduler media

INSERT INTO storage.buckets (id, name, public) VALUES ('scheduler-media', 'scheduler-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('scheduler-thumbnails', 'scheduler-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to scheduler-media
CREATE POLICY "Authenticated users can upload scheduler media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'scheduler-media');

CREATE POLICY "Authenticated users can update scheduler media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'scheduler-media');

CREATE POLICY "Authenticated users can delete scheduler media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'scheduler-media');

CREATE POLICY "Public read scheduler media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'scheduler-media');

-- Thumbnail bucket policies
CREATE POLICY "Authenticated users can upload scheduler thumbnails"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'scheduler-thumbnails');

CREATE POLICY "Authenticated users can delete scheduler thumbnails"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'scheduler-thumbnails');

CREATE POLICY "Public read scheduler thumbnails"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'scheduler-thumbnails');
