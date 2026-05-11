-- Migration 302: Collapse project_type to a binary editing/calendar split.
--
-- Background: until now editing_projects.project_type and
-- content_drop_share_links.project_type carried a 5-way enum
-- (organic_content / social_ads / ctv_ads / general / other) that the UI
-- used to drive copy nouns, filter tabs, and share-page aspect ratios.
-- The Upload Content modal lets Jack pick between "Editing project" and
-- "Content calendar" as the project kind, which fully determines the
-- type, so we don't need the extra dropdown. New world:
--   - calendar = an organic content calendar (was: organic_content)
--   - editing  = an editing-project deliverable, ads or otherwise
--                (was: social_ads / ctv_ads / general / other)
--
-- project_type_other is left in place (existing rows preserved) but new
-- writes never set it.

-- 1. editing_projects.project_type --------------------------------------

ALTER TABLE editing_projects
  ALTER COLUMN project_type DROP DEFAULT;

ALTER TABLE editing_projects
  DROP CONSTRAINT IF EXISTS editing_projects_project_type_check;

UPDATE editing_projects
  SET project_type = 'calendar'
  WHERE project_type = 'organic_content';

UPDATE editing_projects
  SET project_type = 'editing'
  WHERE project_type IN ('social_ads', 'ctv_ads', 'general', 'other');

ALTER TABLE editing_projects
  ADD CONSTRAINT editing_projects_project_type_check
    CHECK (project_type IN ('editing', 'calendar'));

ALTER TABLE editing_projects
  ALTER COLUMN project_type SET DEFAULT 'editing';

COMMENT ON COLUMN editing_projects.project_type IS
  'Binary discriminator: ''editing'' = a deliverable produced through the '
  'editing pipeline (ads, social cuts, anything Jack edits to spec). '
  '''calendar'' = an organic content calendar (post grid, no deliverable '
  'turnaround). Drives copy nouns (post vs. deliverable), filter tabs, '
  'and share-page aspect ratios.';

-- 2. content_drop_share_links.project_type ------------------------------

ALTER TABLE content_drop_share_links
  DROP CONSTRAINT IF EXISTS content_drop_share_links_project_type_check;

UPDATE content_drop_share_links
  SET project_type = 'calendar'
  WHERE project_type = 'organic_content';

UPDATE content_drop_share_links
  SET project_type = 'editing'
  WHERE project_type IN ('social_ads', 'ctv_ads', 'other');

ALTER TABLE content_drop_share_links
  ADD CONSTRAINT content_drop_share_links_project_type_check
    CHECK (project_type IS NULL OR project_type IN ('editing', 'calendar'));

COMMENT ON COLUMN content_drop_share_links.project_type IS
  'Binary discriminator (''editing'' or ''calendar''). NULL means '
  '"unspecified" and renders as a dash in the review table.';
