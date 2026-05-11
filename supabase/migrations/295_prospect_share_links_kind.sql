-- ============================================================
-- SPY-09: Extend prospect_share_links with kind + metadata so the
-- same table can host both scorecard PDFs (SPY-04) and presentation
-- snapshots (SPY-09).
-- ============================================================

ALTER TABLE prospect_share_links
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'scorecard',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill is implicit via DEFAULT.

CREATE INDEX IF NOT EXISTS idx_prospect_share_links_kind
  ON prospect_share_links(prospect_id, kind) WHERE archived_at IS NULL;

-- The 30-day plan lives on the analysis row so it travels with the audit
-- it was drafted from. JSONB lets us round-trip ThirtyDayPlan as-is.
ALTER TABLE prospect_analyses
  ADD COLUMN IF NOT EXISTS thirty_day_plan JSONB;

