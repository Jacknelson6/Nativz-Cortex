-- Adds account-level window totals to platform_snapshots. These come from
-- Instagram Graph API (via Zernio /analytics/instagram/account-insights with
-- metricType=total_value) and represent the MBS-style "Follows" / "Views" /
-- "Content interactions" numbers a business would see in Meta Business Suite.
--
-- We were already storing per-post aggregates (views_count, engagement_count),
-- which undercount because they don't include views on evergreen content that
-- published before the window or counts of account-level events that never
-- hit a specific post. MBS always shows the account-wide totals, so this
-- lets the UI match.
--
-- These fields live on the END-OF-WINDOW snapshot row only — they represent
-- totals for the window ending on `snapshot_date`, not per-day values. The
-- summary route reads the latest snap per profile to populate the UI.
--
-- IG is the only platform where Zernio exposes account-level totals today.
-- TikTok / YouTube / Facebook fields stay null; the UI falls back to the
-- post-aggregate columns for those platforms (which is already how MBS
-- behaves for non-IG as well).

ALTER TABLE platform_snapshots
  ADD COLUMN IF NOT EXISTS new_follows_count integer,
  ADD COLUMN IF NOT EXISTS unfollows_count integer,
  ADD COLUMN IF NOT EXISTS account_views_count integer,
  ADD COLUMN IF NOT EXISTS account_engagement_count integer,
  ADD COLUMN IF NOT EXISTS account_reach_count integer,
  ADD COLUMN IF NOT EXISTS account_profile_visits_count integer,
  ADD COLUMN IF NOT EXISTS accounts_engaged_count integer,
  ADD COLUMN IF NOT EXISTS window_days integer;
