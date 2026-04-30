-- Migration 208: One active share link per client.
--
-- Today the projects table double-renders the same brand because every
-- press of "share" mints a fresh `content_drop_share_links` row. Jack's
-- mental model is "the project IS the share link" — re-creating a
-- calendar should refresh the link, not spawn a new one. This migration
-- enforces that at the DB layer:
--
--   1. Denormalize `client_id` onto `content_drop_share_links` so the
--      uniqueness check is a single-table partial index (a join-based
--      constraint isn't expressible in Postgres).
--   2. Backfill `client_id` from the parent drop. Every drop already has
--      a client_id (verified before applying — `drops_missing_client = 0`).
--   3. Archive every duplicate active link per client, keeping only the
--      newest. The application layer reuses + refreshes that single link
--      from here on; archived rows still resolve by token so previously
--      shared URLs keep working until they actually expire.
--   4. Add `UNIQUE (client_id) WHERE archived_at IS NULL` so a future
--      bug can't reintroduce duplicates without the DB throwing.
--
-- Application code in `app/api/calendar/drops/[id]/share/route.ts` and
-- `lib/calendar/run-pipeline.ts` is updated in the same commit to
-- mint-or-refresh through a shared helper instead of unconditional
-- inserts. Both paths now respect the constraint by design.

-- 1. Denormalized client_id column ----------------------------------

ALTER TABLE content_drop_share_links
  ADD COLUMN IF NOT EXISTS client_id UUID NULL
    REFERENCES clients(id) ON DELETE CASCADE;

-- 2. Backfill from the parent drop -----------------------------------

UPDATE content_drop_share_links s
SET client_id = d.client_id
FROM content_drops d
WHERE s.drop_id = d.id
  AND s.client_id IS NULL;

-- 3. Archive duplicate active links per client ----------------------
--
-- Keep the newest active row, archive the rest. Archived rows stay in
-- the table so cached client URLs still resolve until the token TTL
-- runs out, but they vanish from /api/calendar/review.

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY client_id
           ORDER BY created_at DESC
         ) AS rn
  FROM content_drop_share_links
  WHERE archived_at IS NULL
    AND client_id IS NOT NULL
)
UPDATE content_drop_share_links s
SET archived_at = now()
FROM ranked
WHERE s.id = ranked.id
  AND ranked.rn > 1;

-- 4. Lock down going forward -----------------------------------------

ALTER TABLE content_drop_share_links
  ALTER COLUMN client_id SET NOT NULL;

-- Partial unique index: at most one non-archived share link per
-- client. Expired links are still "non-archived" by this rule on
-- purpose — letting a fresh re-share refresh the same row keeps the
-- token stable for the client.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_share_link_per_client
  ON content_drop_share_links (client_id)
  WHERE archived_at IS NULL;

-- Lookup index for the mint-or-refresh helper.
CREATE INDEX IF NOT EXISTS idx_content_drop_share_links_client_active
  ON content_drop_share_links (client_id)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN content_drop_share_links.client_id IS
  'Denormalized from content_drops.client_id so we can enforce a '
  'one-active-link-per-client constraint via partial unique index. '
  'Application code updates the existing row instead of inserting a '
  'duplicate when re-sharing for the same brand.';
