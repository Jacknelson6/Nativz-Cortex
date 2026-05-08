-- Add an editable per-share name to editing_project_share_links so
-- admins can rename the public review page header (e.g. "JAMNOLA -
-- May Editing Content") without renaming the underlying project for
-- everyone else. Mirrors content_drop_share_links.name. NULL falls
-- back to the derived "Client - Project Name" header.
alter table public.editing_project_share_links
  add column if not exists name text;

comment on column public.editing_project_share_links.name is
  'Optional admin-set display name for the public review page header. NULL falls back to "<client> - <project>". Editable inline from /c/edit/[token] when the viewer is a signed-in admin.';
