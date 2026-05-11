-- Add an editable display title to editing_project_videos so reviewers
-- on the public share link (/c/edit/[token]) can rename a clip to a
-- friendlier label (e.g. "Jaime NOLA Ad Creative V1") instead of the
-- raw upload filename. NULL = fall back to filename.
alter table public.editing_project_videos
  add column if not exists title text;

comment on column public.editing_project_videos.title is
  'Optional human-readable display name for the clip. NULL falls back to filename. Editable from the public share link.';
