-- Backfill platform_snapshots.followers_change from consecutive follower_count
-- values per profile. The column was hardcoded to 0 in the ingest path for a
-- long stretch (see lib/reporting/sync.ts), so 99.5% of historical rows read
-- as flat even when followers actually moved. Summary routes have been
-- updated to derive gains from follower_count directly, but this backfill
-- makes the column itself honest so any future query/report/export that
-- reads it gets the right answer.
--
-- Idempotent: re-running computes the same values. First snapshot per
-- profile has no prior row, so we leave it at 0 (COALESCE).

WITH ranked AS (
  SELECT
    id,
    followers_count - LAG(followers_count) OVER (
      PARTITION BY social_profile_id ORDER BY snapshot_date
    ) AS computed_change
  FROM platform_snapshots
)
UPDATE platform_snapshots ps
SET followers_change = COALESCE(r.computed_change, 0)
FROM ranked r
WHERE ps.id = r.id
  AND COALESCE(ps.followers_change, 0) IS DISTINCT FROM COALESCE(r.computed_change, 0);
