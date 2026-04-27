-- Drop the legacy tasks/projects/shoots/edits discriminator tables and the
-- Todoist integration columns. The tasks feature is being removed; project
-- management will be reworked separately. Live calendar shoots live in
-- shoot_events / calendar_events (untouched). The standalone todos table
-- (migration 013) is also untouched.
--
-- task_activity references tasks via FK, so CASCADE handles the inbound FK.
-- tasks has a self-FK on parent_shoot_id which CASCADE also covers.

DROP TABLE IF EXISTS public.task_activity CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;

ALTER TABLE public.users DROP COLUMN IF EXISTS todoist_api_key;
ALTER TABLE public.users DROP COLUMN IF EXISTS todoist_project_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS todoist_synced_at;
