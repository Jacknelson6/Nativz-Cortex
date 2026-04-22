# Competitor Intelligence — UX redesign

**Date:** 2026-04-22
**Status:** approved (Jack, sight-unseen autonomous run)
**Linear:** extends NAT-7 (Competitor Spying polish) and NAT-8 (Benchmarking in Analytics)

## TL;DR

Today Cortex has three loosely-connected surfaces doing competitor work:

1. `/admin/analyze-social` — run a one-shot audit of a brand's TikTok/IG/YT presence vs. 2–3 competitors.
2. `/admin/analytics?tab=benchmarking` — long-running benchmark charts driven by the `benchmark-snapshots` cron.
3. The `Competitor Spying` sidebar collapsible pointing at both.

The flow from "I want to know what a competitor is doing" to "I want to watch them over time" is broken: the audit and the benchmark don't talk to each other, and the sidebar makes it look like two separate products.

This spec rebuilds the admin-side competitor surface as a single product called **Competitor Intelligence**. One sidebar entry. One landing page. Two primary actions (audit now / watch over time). One unambiguous deep-link into `/admin/analytics?tab=benchmarking` for history. Impeccable-driven visual execution using Nativz brand tokens (purple CTA, cyan accent, pill buttons, full-circle icon tiles, eyebrow + cyan underline hero).

## Goals

1. **Single mental model.** Jack describes it as "competitor spying + benchmarking." The UI should describe it the same way — as one product with two modes.
2. **One-click conversion.** From an audit → "watch this competitor" → enrolled in benchmarking, no re-typing URLs.
3. **Radiate intelligence.** Per Impeccable: show counts, sources, last-seen timestamps, model names — the "we did the reading" feel. Nerdy · Intelligent · Confident.
4. **Don't regress existing work.** NAT-7 fixes (social disambiguation, scorecard) stay intact. NAT-8's benchmarking tab location stays in Analytics, per the committed product decision.

## Non-goals

- Rewriting the audit report itself (Pushes A/B/C shipped — out of scope).
- Touching the portal-side competitor view (none exists; this stays admin-only).
- Moving benchmarking out of `/admin/analytics`. The cross-link pattern is the decision.

## Architecture

### Sidebar change

In `components/layout/admin-sidebar.tsx`, the `Competitor Spying` collapsible is replaced with a single item:

```
Competitor intelligence → /admin/competitor-intelligence
```

No children. Icon: `Radar` from lucide (matches the "watching" metaphor). The retired `/admin/competitor-tracking/tiktok-shop` route stays reachable via a small link on the new landing page ("Legacy: TikTok Shop tracker") but no longer occupies sidebar real estate.

### URL structure

| URL | Purpose |
| --- | --- |
| `/admin/competitor-intelligence` | Landing page — hub for audits + watches. |
| `/admin/competitor-intelligence/audits` | Redirect → `/admin/analyze-social` (existing). |
| `/admin/competitor-intelligence/audits/[id]` | Redirect → `/admin/analyze-social/[id]` (existing report). |
| `/admin/competitor-intelligence/watch` | New — ongoing-watch setup flow. |
| `/admin/analyze-social` | Unchanged — keep working; we redirect the new URL to it, not the other way around. |
| `/admin/analytics?tab=benchmarking` | Unchanged — destination for history. |

Redirects on the new URLs use a `redirect()` call in the Next.js page file so the existing page.tsx components don't move. Incremental, reversible.

### Landing page: `/admin/competitor-intelligence`

Full Impeccable treatment. Layout top-to-bottom:

#### 1. Hero band

- **Eyebrow:** `Competitor intelligence` in cyan italic, small (12px, Rubik 500, `--nz-cyan`).
- **H1:** `See what the <u>competition</u> is posting — and when it changes.` Jost 700, 56px at lg, 40px at md, 32px at sm. The `<u>` wraps "competition" and renders as the signature cyan highlighter bar (existing `.nz-u` style).
- **Subhead:** one paragraph (18px Poppins Light, `rgba(255,255,255,0.80)`). Reads: *"Run a deep audit of any brand's short-form presence, or enrol competitors into an ongoing benchmark. Cortex watches, captures deltas, and sends the report."*
- **Stagger-on-mount** using the existing motion tokens — eyebrow → H1 → subhead → action band, `--duration-sm` each, 60ms step. `transform: translateY(8px) → 0` + `opacity: 0 → 1`.

#### 2. Action band (two side-by-side cards)

Two equally-weighted cards, 50/50 at lg, stacked at md/sm. Each card uses the `bg-surface` + `border-nativz-border` treatment from existing admin pages, elevated by a subtle shadow (`0 1px 0 rgba(255,255,255,0.04) inset, 0 16px 40px -24px rgba(0,0,0,0.6)`).

**Card A — "Run an audit" (primary action):**
- Full-circle icon tile, 56px, cyan-tinted (`bg-nz-cyan-50/10 text-nz-cyan`). Icon: `Search`.
- H3 (Jost 600, 22px): "Run an audit"
- Body (14px Poppins, secondary text): "Deep-dive a brand across TikTok, Instagram and YouTube. Auto-discovers competitors. ~4 minutes."
- Footer: a **pill CTA** "Start audit" (purple `--nz-purple` → `--nz-purple-700` on hover, white text, 8px vertical / 20px horizontal padding, `border-radius: 9999px`, Jost 700 uppercase 2px tracking).

**Card B — "Watch a competitor" (secondary action):**
- Full-circle icon tile, coral-tinted (`bg-nz-coral-100/10 text-nz-coral`). Icon: `Radar`.
- H3: "Watch a competitor"
- Body: "Enrol a competitor profile into ongoing benchmarking. Snapshots refresh weekly, biweekly, or monthly. History lives in Analytics."
- Footer: pill CTA "Set up watch" — same geometry but ghost variant (transparent bg, cyan border + text).

Motion: both cards lift +4px on hover (transform, not box-shadow). Icon tile rotates 8deg on card hover (cyan card) or pulses scale 1 → 1.06 → 1 (coral card). Purely decorative, <200ms, respects `prefers-reduced-motion`.

#### 3. "Latest audits" strip

Section header: eyebrow `Recent` + H2 `Latest audits` + right-aligned ghost link `View all →` (goes to `/admin/analyze-social`).

Four horizontally-scrolling cards at sm, 4-column grid at lg. Each card:
- Favicon of prospect (or `WebsiteIcon` fallback).
- Brand name (16px Jost 600).
- Status pill (reuse `StatusPill` from existing infrastructure page).
- Created timestamp as relative ("2h ago") in monospace `text-xs text-white/55`.
- Scorecard mini-row: 3 dots (R/Y/G) for posting freq / ER / avg views.
- Hover: whole card darkens to `--nz-ink-3`, arrow icon appears on right.
- Click → `/admin/analyze-social/[id]`.

Empty state: Small cyan circular icon + "No audits yet" + ghost "Run your first audit" link.

#### 4. "Active watches" strip

Section header: eyebrow `In-flight` + H2 `Watched competitors` + right-aligned ghost link `Open benchmarking →` (goes to `/admin/analytics?tab=benchmarking`).

Chip-card row. Each chip is wider than a typical pill — ~280px — and shows:
- Small favicon + handle (e.g. `@brandname` Jost 600 14px).
- Platform badge (TT/IG/YT micro-mark in the platform color).
- Sparkline (12 data points from the last 12 snapshots, cyan stroke on transparent bg) rendered inline via tiny Recharts `<LineChart>` or SVG.
- Delta chip: `+3.2% followers` (green) or `-1.1%` (coral) in monospace.
- Last snapshot time, tertiary text.
- Click → `/admin/analytics?tab=benchmarking&competitor=<id>` (deep-link param added to the benchmarking tab, see below).

Empty state: "No competitors enrolled yet — run an audit and hit 'Watch this competitor' on any result."

#### 5. Footer row

Small row of links, tertiary text:
- `Legacy TikTok Shop tracker →` → `/admin/competitor-tracking/tiktok-shop`
- `Benchmarking history →` → `/admin/analytics?tab=benchmarking`
- `Recurring reports →` → `/admin/competitor-intelligence/reports` (Spec 3 lands here)

### Watch flow: `/admin/competitor-intelligence/watch`

A 3-step card wizard, one step per screen, URL-driven (`?step=1|2|3`). Matches the existing onboarding/service-template flow aesthetic so the component library can be re-used (see `components/onboarding/*`).

**Step 1 — Pick a client.**
- Client picker (re-use `ClientPicker` from `components/clients/`).
- Above: eyebrow `Step 1 / 3` + H2 `Which client are you watching for?`.
- Next button disabled until picked.

**Step 2 — Add competitor profiles.**
- Multi-row input: paste a TikTok, Instagram, or YouTube URL → row shows favicon, detected handle, platform badge.
- Live validation via existing `lib/audit/scrape-*.ts` helpers in dry-run mode (we only need to confirm the URL parses, not actually scrape yet).
- "+ Add another" at bottom. Max 5 per watch setup (soft limit, enforceable in validation).
- Back / Next pair.

**Step 3 — Pick cadence + confirm.**
- Radio cards (large tap targets): Weekly / Biweekly / Monthly. Matches `client_benchmarks.cadence` enum exactly.
- Preview panel below: "Cortex will snapshot these N profiles every <cadence>. Next snapshot: <date>."
- "Start watching" pill CTA (purple).
- On submit: `POST /api/benchmarks/track-competitor` (existing endpoint — may need a small extension to accept an array of profiles).
- Success → redirect to `/admin/analytics?tab=benchmarking&justAdded=<client_id>` with a toast.

### Audit report → watch hook

On `/admin/analyze-social/[id]`, the Competitors section of the report gets a new per-row action:

- Next to each competitor row header, a small ghost button: "Watch this competitor →"
- Click → opens a lightweight popover (not full page navigation):
  - Pre-fills the competitor's platform URLs from the audit data.
  - Client picker seeded with the audit's attached client (if any).
  - Cadence radio (default weekly).
  - "Start watching" pill CTA.
- Submit → same `POST /api/benchmarks/track-competitor` → success toast → popover closes.

This is the critical UX shortcut: from "interesting, they post a lot" to "I'm now tracking them" in two clicks.

### Benchmarking tab deep-link

`/admin/analytics?tab=benchmarking&competitor=<id>` — the benchmarking tab component should read the query param on mount, scroll-focus the matching competitor row, and highlight it with a `animate-focus-ring` class (cyan ring, fades over 1.5s). One new prop on `BenchmarkingTab`; everything else unchanged.

## Visual rhythm + motion

- **Stagger reveal** on landing page: eyebrow (0ms) → H1 (60ms) → subhead (120ms) → action band (200ms) → Latest audits (300ms) → Active watches (400ms). Reuse `app/globals.css` stagger utility if one exists; otherwise inline via `style={{ animationDelay }}`.
- **Hover lifts** on all clickable cards: `transform: translateY(-2px)` + tighter shadow. 150ms `--ease-out-expo`.
- **Sparkline draw-on** effect for the first render of each "Active watches" chip: the polyline uses `stroke-dasharray` + `stroke-dashoffset` animation, 600ms, respects reduced motion.
- **Pill CTA** bounce micro-interaction on click: scale 1 → 0.96 → 1 over 200ms. Satisfying, not annoying.

## Components (new)

- `components/competitor-intelligence/landing-hero.tsx`
- `components/competitor-intelligence/action-band.tsx`
- `components/competitor-intelligence/latest-audits-strip.tsx`
- `components/competitor-intelligence/active-watches-strip.tsx`
- `components/competitor-intelligence/watch-wizard.tsx`
- `components/competitor-intelligence/watch-competitor-popover.tsx`
- `components/competitor-intelligence/sparkline-chip.tsx`

## Components (modified)

- `components/layout/admin-sidebar.tsx` — replace collapsible with single link.
- `components/audit/audit-report.tsx` — add "Watch this competitor" button + popover mount.
- `components/analytics/benchmarking-tab.tsx` — read `?competitor=` param, focus-ring highlight.

## Data model

**No new tables.** We reuse `client_benchmarks` (already has cadence, next_snapshot_due_at) and `benchmark_snapshots` (per-snapshot rows).

One small migration to add a convenience index on the new deep-link query pattern:

```sql
-- 129_benchmark_client_index.sql
create index if not exists idx_client_benchmarks_client_id
  on client_benchmarks (client_id, active) where active = true;
```

## API surface

- `POST /api/benchmarks/track-competitor` — extend to accept an array of profile URLs in a single request (currently takes one). Keep backward-compat by accepting either `{ url }` or `{ urls: [] }`. Zod schema updated.
- No other API changes.

## Error + empty states

- Landing page with no audits AND no watches: large centered state — cyan icon, "Start by running your first audit", pill CTA.
- Watch flow step 2 with zero valid rows: Next button disabled + inline helper text under the empty row.
- `POST /api/benchmarks/track-competitor` failure: toast with the truncated error; form stays open with the entered data.

## Testing / QA

Playwright smoke tests (added to `tests/competitor-intelligence.spec.ts`):

1. `/admin/competitor-intelligence` returns 200 with hero, action band, two strips rendered.
2. Sidebar "Competitor intelligence" link navigates correctly; no collapsible is present.
3. "Start audit" CTA navigates to `/admin/analyze-social`.
4. "Set up watch" navigates to `/admin/competitor-intelligence/watch?step=1`.
5. Watch wizard step 3 submit calls the API and redirects to benchmarking.
6. `/admin/competitor-intelligence/audits/abc123` redirects to `/admin/analyze-social/abc123`.

Manual QA (Jack):
- Visual check vs. `.impeccable.md` principles.
- Run an audit, use "Watch this competitor" → confirm the competitor appears in Analytics Benchmarking with the matching cadence.
- Verify reduced-motion preference disables the stagger + draw-on sparklines.

## Rollout

Single commit, single deploy. Sidebar change is risky because it affects every admin view — but the change is a label/href swap, not a structural change. If it breaks in prod, revert the one file.

## File list

**New:**
- `app/admin/competitor-intelligence/page.tsx` (landing)
- `app/admin/competitor-intelligence/watch/page.tsx` (wizard)
- `app/admin/competitor-intelligence/audits/page.tsx` (redirect)
- `app/admin/competitor-intelligence/audits/[id]/page.tsx` (redirect)
- `app/admin/competitor-intelligence/reports/page.tsx` (placeholder, filled by Spec 3)
- `components/competitor-intelligence/*` (7 files listed above)
- `supabase/migrations/129_benchmark_client_index.sql`
- `tests/competitor-intelligence.spec.ts`

**Modified:**
- `components/layout/admin-sidebar.tsx`
- `components/audit/audit-report.tsx`
- `components/analytics/benchmarking-tab.tsx`
- `app/api/benchmarks/track-competitor/route.ts`
