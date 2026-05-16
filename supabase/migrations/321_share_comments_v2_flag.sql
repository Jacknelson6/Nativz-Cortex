-- ============================================================================
-- 321: Share-link comments v2, per-organization feature flag (PRD 09)
--
-- Adds `feature_flags jsonb` to organizations so the share-comments v2 stack
-- (auth gateway, identity model, admin operator controls, dispatcher) has a
-- per-org kill switch we can flip without a deploy. Reads happen via
-- `isShareCommentsV2Enabled(organizationId)` in lib/share/feature-flags.ts.
--
-- Default state: empty jsonb on every org. Helper returns `true` when no
-- key is present so v2 stays on by default for every brand that has already
-- been onboarded against the new code paths. Flip `share_link_comments_v2`
-- to false on a specific org to fall back to the legacy bare-link experience
-- if a regression surfaces.
-- ============================================================================

alter table organizations
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;

-- Index lets us filter by flag value without scanning every row when we
-- ever need to ask "which orgs are still on v1?".
create index if not exists idx_organizations_feature_flags
  on organizations using gin (feature_flags);
