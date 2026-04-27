-- File attachments on public share-link comments.
-- A reviewer (anon) can attach screenshots / reference files alongside their
-- comment. Uploads go through /api/calendar/share/[token]/upload which uses
-- createAdminClient(); this migration just provisions the column + a public
-- bucket the upload route can write to.

ALTER TABLE post_review_comments
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('share-comment-attachments', 'share-comment-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read share comment attachments" ON storage.objects;
CREATE POLICY "Public read share comment attachments"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'share-comment-attachments');
