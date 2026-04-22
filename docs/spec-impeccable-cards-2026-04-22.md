# Impeccable cards pass — 2026-04-22

## Context

Jack left for a multi-hour window and asked for an autonomous "make the cards
look really nice" pass using the impeccable skill. The session so far had
already ripped purple out of the progress bar, rebuilt the Trend Finder
loader as a research console, shipped the Infrastructure admin page, and
fixed the Reddit/YouTube/Quora data-loss + prod SearXNG default bugs. This
spec captures the plan for the autonomous pass so there's a trail to audit
when Jack returns.

## Source of truth

- `.impeccable.md` at project root — Nativz brand tokens (Jost / Poppins /
  Rubik, cyan `#00AEEF`, purple `#9314CE` CTA-only, coral `#ED6B63` urgency,
  cyan highlighter `#0082b5/.70`, flat surfaces, pill CTAs, eyebrow italic
  text).
- `docs/detail-design-patterns.md` — 56 curated micro-interactions already
  in the system; reuse before inventing.

## Principles I'm holding myself to

1. **No banned patterns.** No `border-left:` >1px accent stripes, no
   `background-clip: text` gradient text, no generic drop shadows on resting
   cards, no glassmorphism-as-decoration, no modal-as-lazy-fix.
2. **Purple only shows up on actual CTAs** (`--nz-purple`). Cyan is the
   brand / highlight / signal color everywhere else.
3. **Confidence through evidence.** Cards that represent pipeline output
   should expose counts, timestamps, source URLs, model identifiers. The
   old instinct is to "clean these up" — keep them. Cortex is research
   software and the research should show.
4. **Flat by default.** Cards sit on `bg-surface` over `bg-background`.
   Hover lift is allowed; resting shadow is not.
5. **Sentence case everywhere** per CLAUDE.md.

## Targets (in priority order)

### Tier 1 — admin-facing Infrastructure page

- `app/admin/infrastructure/page.tsx` — the page Jack was literally looking
  at when he flagged "anything we can improve here?".
- Polish already in-flight from earlier today: cyan-only stage bar, grouped
  legend, long-pole header, cyan status pill. **Remaining work:**
  - Tighten the summary-strip cards: add eyebrow label + larger numeric
    display + subtle hover-lift interaction (no resting shadow).
  - Configured-models card: make the provider slug prefix more legible
    (provider-tinted left edge would violate the `border-left` ban — use a
    small cyan mono tag before the slug instead).
  - Recent-runs row header: better vertical rhythm + more legible timestamp.

### Tier 2 — customer-facing results page (`app/admin/search/[id]/results-client.tsx`)

The main deliverable. 14+ card components flow through the results page.
**Strategy:** rather than individually polishing every one, apply
**container-level** refinements that lift all of them at once:

- Tighten the `rounded-xl border border-nativz-border bg-surface` repeated
  pattern (appears many times). No change to the component internals —
  just a consistent gutter and rhythm at the page container level.
- Ensure the sticky header uses brand tokens cleanly (no emerald/stripes).
- Small signature moment: eyebrow on each section with an actual
  `<u className="nz-u">` highlight on key section names.

### Tier 3 — Trend Finder entry

Already polished earlier this session. No additional work unless time
permits.

## Non-goals (explicitly deferred)

- **Individual card internals** (EmotionsBreakdown, TrendingTopicsTable,
  ContentPillars, etc.) — each one deserves a dedicated pass. This session
  is the container/shell pass.
- **Vercel Workflow migration** of the long-running pipeline — flagged by
  posttooluse hook, parked for a later focused refactor.
- **Streaming merger** — Infrastructure data will tell us if the merger
  is actually the bottleneck. Prior analysis showed **platform scrapers**
  are the long pole (80% of wall-clock on the "immersive art attraction"
  run), not the merger.

## Ship strategy

- Commit per tier so Vercel deploys are incremental and reviewable.
- Typecheck after each tier; roll back individual tiers if something is
  off rather than the whole session.
- No breaking changes to component public APIs.
- Leave a summary document in `docs/session-handoff-2026-04-22-cards.md`
  when done, so Jack's return can start from "here's what changed and why."

## Verification before claiming done

- `npx tsc --noEmit` passes (ignoring the pre-existing
  `client-admin-shell.tsx` errors unrelated to this work).
- Each commit shows what changed + why in the message body.
- Dev server still boots (`npm run dev` on port 3001) and the Infrastructure
  + Trend Finder + one results URL all render without console errors.
