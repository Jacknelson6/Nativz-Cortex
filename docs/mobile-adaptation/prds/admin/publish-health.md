# Publish Health — Mobile PRD

**Route:** `/admin/ops/publish-health`
**Actor:** admin
**Sidebar:** Admin → Publish Health

## Purpose
Live dashboard for the publish pipeline. Shows scheduled-vs-published delta, stuck-publishing entries, recent failures, daily SLO rollup card. Crons feed into this view.

## Desktop UI (UNCHANGED)
- Top KPI strip: today's scheduled count, published, failed, late_post_id rotations, SLO % (from `publish-slo` daily rollup).
- Failure list table with columns: scheduled-at, client, platform, error, last-retry.
- Action toolbar (re-run, reconcile, dismiss).

## Mobile transformations
**Apply from playbook: T1, T2, T3, T4, T5**

### KPI strip
- `max-lg:grid-cols-2`. SLO % gets a hero-tile treatment (largest).
- Daily SLO rollup card stays inline below KPIs; full width.

### Failure list
- Table → card list. Card: client logo, platform icon, scheduled-at relative, 1-line error, kebab (Retry / Reconcile / Dismiss).
- Expand-on-tap to show full error stack + last-retry timestamp.
- Filter pill row: All / Failed / Stuck publishing / Reconcile pending (T6).

### Actions
- Per-card actions in kebab → sheet.
- Bulk "Re-run all failed" action stays as a sticky bottom CTA when filter = Failed.

## Touch & sizing
- KPI tiles: 56px tall minimum, large stat numbers.
- Card kebab: 44 × 44.

## Out of scope
- Live tailing of cron logs (links out to Vercel logs on desktop; mobile renders link only).

## Acceptance criteria
- Failed-count tile glanceable in first viewport.
- Retry firable from card in 2 taps.
- Desktop diff = 0 at `lg+`.
