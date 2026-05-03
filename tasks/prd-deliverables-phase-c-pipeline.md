# PRD: Deliverables Phase C — Pipeline Visibility + Editor Attribution

## Why this exists

After Phase B, clients can see how much scope they have left and admins can see balances per deliverable type. But neither side can see **what's in motion**. A client viewing `/deliverables` on the 20th of the month sees "12 Edited Videos remaining" with no clue whether 4 are mid-edit, 2 are in review, and 6 are unstarted. Admins viewing the admin shell see balance numbers but no per-editor margin and no thumbnails on ledger rows, so they can't answer "which editor cost us the most this month" or "what did we deliver to Nike in March."

Phase C closes both gaps. The client gets a pipeline view (in-flight / in-review / delivered with thumbnails). Admins get editor attribution stamped on every consume row + a margin view that joins consume rows to editor cost rates.

This phase is the difference between a balance-tracking system and a deliverable-tracking system.

## Goals

- Capture `editor_user_id`, `revision_count`, and `deliverable_id` on every consume row
- Render an in-flight pipeline view on `/deliverables` for both admin and viewer
- Show deliverable thumbnails on ledger rows where one exists (`content_drop_videos.thumbnail_url`)
- Build a per-editor margin view in the admin shell (revenue from consumes attributed to an editor minus that editor's cost rate × time)
- Track `team_member_cost_rate_cents_per_hour` on `team_members` so margin math has a denominator

## Non-goals

- Time tracking (we infer time from `updated_at - created_at` on the deliverable, accept the rough estimate for v1)
- Editor self-service margin view (admin-only this phase)
- Multi-editor attribution (one row, one editor; if two editors collaborate, attribute to the one who pushed the final cut)
- Margin alerting / thresholds (Phase D or later)

## Schema changes (migration 222_deliverables_attribution.sql)

```sql
ALTER TABLE deliverable_transactions
  ADD COLUMN editor_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN revision_count integer NOT NULL DEFAULT 0,
  ADD COLUMN deliverable_id uuid; -- generic FK pointer; resolved per-type in app code

CREATE INDEX idx_deliverable_tx_editor_created
  ON deliverable_transactions (editor_user_id, created_at DESC)
  WHERE editor_user_id IS NOT NULL;

ALTER TABLE team_members
  ADD COLUMN cost_rate_cents_per_hour integer;

-- Backfill from existing data where possible: a content_drop_video has an
-- updated_by, use that as a starting attribution. Manual cleanup OK after.
UPDATE deliverable_transactions t
SET editor_user_id = v.last_edited_by
FROM content_drop_videos v
WHERE t.charge_unit_kind = 'drop_video'
  AND t.charge_unit_id = v.id
  AND t.kind = 'consume'
  AND t.editor_user_id IS NULL;
```

## Pipeline view data model

The pipeline state isn't a new table — we derive it from existing fields:

| State | Predicate |
|---|---|
| **Unstarted** | `content_drop_videos` exists, no `final_video_url`, no comments |
| **In edit** | `final_video_url` set but `post_review_comments.status != 'approved'` count = 0 |
| **In review** | `final_video_url` set + has a non-approved review comment in last 7 days |
| **Approved (consumed)** | `deliverable_transactions.kind = 'consume'` exists for the row |
| **Delivered** | `scheduled_posts.status = 'published'` exists for the row |

Each state gets a thumbnail (`thumbnail_url || draft_thumbnail_url || placeholder`), a label, and a relative timestamp.

## Component changes

### New components

| File | Purpose |
|---|---|
| `components/deliverables/pipeline-view.tsx` | Lays out 5 columns (Unstarted, In edit, In review, Approved, Delivered) with thumbnail cards. Drag-and-drop disabled in v1. Click → opens the deliverable detail in a modal. |
| `components/deliverables/pipeline-card.tsx` | Single card: thumbnail, deliverable type pill, title, editor avatar (if attributed), relative timestamp |
| `components/deliverables/pipeline-skeleton.tsx` | Loading state |
| `components/deliverables/admin-margin-view.tsx` | Bottom panel of admin shell. Per-editor table: Name / Deliverables this period / Hours / Cost / Revenue / Margin. |

### Files modified

| File | Change |
|---|---|
| `app/(app)/deliverables/page.tsx` | Insert `<PipelineView>` between `<ProductionHero>` and `<RecentActivity>`. Skeleton-load the pipeline data. |
| `lib/credits/comment-hooks.ts` | `consumeForApproval` now reads `editor_user_id` from `content_drop_videos.last_edited_by` (or fallback chain) and passes it through. |
| `lib/credits/consume.ts` | Add `editorUserId`, `revisionCount`, `deliverableId` to the params bag. |
| `components/deliverables/recent-activity.tsx` | Activity rows now render thumbnail + editor avatar where attributed. |
| `components/deliverables/admin-shell.tsx` | Add Margin tab alongside per-type tabs. |

### New API routes

| Route | Returns |
|---|---|
| `GET /api/deliverables/[clientId]/pipeline` | Pipeline data for the client. Buckets by state. Includes thumbnails. |
| `GET /api/deliverables/[clientId]/margin?period_start=&period_end=` | Per-editor breakdown for the period. Admin-only. |

## Margin math

```
margin_cents = revenue_cents - editor_cost_cents

revenue_cents
  = SUM over consume rows in period attributed to editor:
      deliverable_types.unit_cost_cents

editor_cost_cents
  = team_member.cost_rate_cents_per_hour
    * estimated_hours_for_period

estimated_hours_for_period
  = SUM over content_drop_videos last_edited_by = editor in period:
      EXTRACT(EPOCH FROM (final_uploaded_at - created_at)) / 3600
    BOUNDED to [0.25, 8] per video to filter pathological time stamps
```

The bounding is honest about the imprecision: a video that took 15 minutes (typo on `created_at`) gets counted as 0.25h; one that took a week gets capped at 8h. Document this in a hover-tooltip on the margin column header.

## Acceptance criteria

- [ ] Pipeline view renders on `/deliverables` for both roles, with at least one card visible per state where data exists
- [ ] Thumbnails load for ≥80% of cards (the rest fall back to a placeholder gracefully)
- [ ] `consumeForApproval` writes `editor_user_id` on every new consume row going forward
- [ ] Backfill SQL populated `editor_user_id` on ≥70% of historical consume rows (the rest had ambiguous attribution, OK)
- [ ] Margin view in admin shell shows ≥1 editor row with non-zero margin for a period containing real data
- [ ] Setting `team_members.cost_rate_cents_per_hour` to NULL hides that editor from the margin view (no division-by-zero)
- [ ] Pipeline + margin queries complete in <500ms p95 on a client with 100 deliverables in the period
- [ ] All Phase A + B acceptance criteria still hold

## Verify gates

1. `npx tsc --noEmit` passes
2. `npm run lint` clean
3. Visual QA: pipeline view density matches `/admin/calendar` (sibling page) — same card spacing, same thumbnail aspect, same hover states
4. Margin view shows real numbers for a known editor on a known week
5. Performance check: `EXPLAIN ANALYZE` on the pipeline + margin queries shows index scans, no seq scans
6. Commit + push to main
