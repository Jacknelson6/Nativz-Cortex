-- Migration 207: Bump editing-media bucket from 500 MB to 5 GB.
--
-- The bucket was created via the Supabase dashboard with the default
-- 500 MB file_size_limit. Short-form raw cuts (especially the master
-- exports an editor pushes before compressing) routinely exceed 500 MB,
-- so the editing-project detail dialog surfaced
-- "The object exceeded the maximum allowed size" mid-upload. 5 GB is
-- the new ceiling, matching what editors actually push and leaving
-- headroom for higher-bitrate exports without bumping again next month.
--
-- Idempotent: only runs when the bucket exists; ignores already-bumped
-- rows so a fresh dev DB and a re-applied prod migration both land on
-- the same final state.

update storage.buckets
set file_size_limit = 5368709120
where id = 'editing-media'
  and (file_size_limit is null or file_size_limit < 5368709120);
