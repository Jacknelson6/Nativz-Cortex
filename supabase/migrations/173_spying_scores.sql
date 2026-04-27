-- ─────────────────────────────────────────────────────────────────────────
-- Migration 173 — Spy benchmarking scores on snapshots
--
-- Forward-only scoring: every snapshot row carries the score of *that*
-- snapshot. Historical rows stay null — we never back-fill, because the
-- rubrics will drift over time and a back-filled score would be a different
-- model than the snapshot it claims to describe.
--
-- The scoring model lives in lib/spying/{scoring,rubrics,score-snapshot}.ts.
-- This migration adds the persistence side — columns + indexes only, no
-- triggers. The snapshot cron computes scores in TS and writes them on
-- insert; we don't want to recompute in Postgres.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Component scores: 0..100, numeric so we keep one decimal of precision ──
ALTER TABLE benchmark_snapshots
  ADD COLUMN IF NOT EXISTS velocity_score   NUMERIC,
  ADD COLUMN IF NOT EXISTS engagement_score NUMERIC,
  ADD COLUMN IF NOT EXISTS reach_score      NUMERIC,
  ADD COLUMN IF NOT EXISTS bio_score        NUMERIC,
  ADD COLUMN IF NOT EXISTS caption_score    NUMERIC,
  ADD COLUMN IF NOT EXISTS composite_score  NUMERIC;

-- ── Raw inputs: kept on the row so we can show the math, debug grading,
--    and re-derive scores under a future rubric without re-scraping. ──────
ALTER TABLE benchmark_snapshots
  ADD COLUMN IF NOT EXISTS posts_last_30d    INTEGER,
  ADD COLUMN IF NOT EXISTS median_engagement NUMERIC,
  ADD COLUMN IF NOT EXISTS median_views      NUMERIC;

-- ── LLM rubric breakdowns: per-criterion bits + rationale, so the UI can
--    show "missing CTA" without another LLM call. ─────────────────────────
ALTER TABLE benchmark_snapshots
  ADD COLUMN IF NOT EXISTS bio_breakdown     JSONB,
  ADD COLUMN IF NOT EXISTS caption_breakdown JSONB;

-- ── Sanity bounds. NUMERIC has no native range, so check 0..100 explicitly.
--    NULL is allowed (back-fill stays null). ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'benchmark_snapshots_scores_in_range'
  ) THEN
    ALTER TABLE benchmark_snapshots
      ADD CONSTRAINT benchmark_snapshots_scores_in_range CHECK (
        (velocity_score   IS NULL OR (velocity_score   >= 0 AND velocity_score   <= 100)) AND
        (engagement_score IS NULL OR (engagement_score >= 0 AND engagement_score <= 100)) AND
        (reach_score      IS NULL OR (reach_score      >= 0 AND reach_score      <= 100)) AND
        (bio_score        IS NULL OR (bio_score        >= 0 AND bio_score        <= 100)) AND
        (caption_score    IS NULL OR (caption_score    >= 0 AND caption_score    <= 100)) AND
        (composite_score  IS NULL OR (composite_score  >= 0 AND composite_score  <= 100))
      );
  END IF;
END
$$;

-- ── Leaderboard reads: latest snapshot per benchmark, ordered by composite.
--    Partial index on rows that actually have a composite — matches the
--    "forward-only" rule and keeps the index small while back-fill is null. ─
CREATE INDEX IF NOT EXISTS idx_benchmark_snapshots_leaderboard
  ON benchmark_snapshots(benchmark_id, composite_score DESC, captured_at DESC)
  WHERE composite_score IS NOT NULL;

COMMENT ON COLUMN benchmark_snapshots.velocity_score   IS '0..100 — posts in last 30d, par 8/mo (lib/spying/scoring.ts#scoreVelocity)';
COMMENT ON COLUMN benchmark_snapshots.engagement_score IS '0..100 — log-scaled median (likes+comments+shares) per post';
COMMENT ON COLUMN benchmark_snapshots.reach_score      IS '0..100 — log-scaled median views per post';
COMMENT ON COLUMN benchmark_snapshots.bio_score        IS '0..100 — IG-only Standard Ranch Water rubric, 0 for TikTok';
COMMENT ON COLUMN benchmark_snapshots.caption_score    IS '0..100 — average per-caption rubric (length / cta / hashtags)';
COMMENT ON COLUMN benchmark_snapshots.composite_score  IS '0..100 — platform-weighted composite (lib/spying/scoring.ts#composePlatformScore)';
