-- Migration 248: Allow images on the editing-media bucket.
--
-- The bucket was created (via dashboard) with allowed_mime_types
-- restricted to video/* types. The /admin/content-tools uploader and
-- the /api/admin/editing/projects/:id/videos route both branch on
-- image/* MIME and write image rows directly to Storage (bypassing
-- the Mux pipeline), but Supabase Storage rejected the PUTs with 400
-- because PNG/JPEG/WebP/etc weren't on the bucket's allow-list.
--
-- This adds the common image types editors paste in (post drops,
-- carousel slides, static cuts). Heic is included because iPhone
-- exports often land here before the editor converts them.
--
-- Idempotent: only runs when the bucket exists.

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]
where id = 'editing-media';
