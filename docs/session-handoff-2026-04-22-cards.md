# Session handoff — 2026-04-22 impeccable cards pass

Jack stepped away for a multi-hour block and asked me to run autonomously on
"making the cards look really nice using impeccable." This doc summarizes
what changed so Jack can pick up cold without trawling through commit
history.

Spec: [`docs/spec-impeccable-cards-2026-04-22.md`](./spec-impeccable-cards-2026-04-22.md).

## Deploys that went out (in order)

Each bullet = one commit on `main` → Vercel auto-deploy.

1. **`polish(infrastructure): impeccable card pass — Stat / ModelRow / header`** (0bbb319)
2. **`polish(results): drop purple, kill banned border-left stripes`** (4b805b7)
3. **`polish(cards): drop last banned border-l stripes + stats-row accent drift`** (7a6147c)
4. **`polish(results): swap purple viral_potential + rainbow source icons`** (586daf5)

Plus three earlier commits from the same session (before Jack left):
- `fix(topic-search)` — prod SearXNG fallback, Reddit/YouTube/Quora save bug, TikTok stagger delays
- `fix(infrastructure)` — caching, skeleton, AVG TOTAL fix, cyan-only stage colors
- `polish(loader)` — research console terminal UI

## What's actually different on screen

### Infrastructure page (`/admin/infrastructure`)

Note: Jack refactored this into a tabbed shell in parallel while I was
working. My polish work landed in `components/admin/infrastructure/stat.tsx`
and is still in use across every tab. The Stat / StatusPill / Meta
components I wrote for the flat page are now the shared primitives.

What users see:
- **Cyan `Cortex · admin` eyebrow** above the page title (matches the
  `Cortex pipeline` eyebrow on the research console loader — the two
  surfaces now read as one system).
- **Summary strip cards** lift -1px on hover, carry a tiny cyan dot in
  the top-left as a subtle brand signature. Value is 2xl tabular-nums
  leading-none; label is mono caps eyebrow.
- **Status pills** (`completed`, `failed`, `processing`) use brand cyan /
  coral / neutral — no more emerald/amber from the original shipout.

### Trend Finder processing screen

Already redesigned earlier in the session as the "research console" with
terminal chrome, monospace log lines, and blinking cyan caret.

### Results page (`/admin/search/[id]`)

- **ExecutiveSummary + BrandApplication twin** at the top:
  - Icon tiles are now full circles with a 1px ring, matching the "icon
    backings are circles, not rounded squares" brand rule confirmed
    against the live nativz.io marketing site.
  - Section heading is a mono caps eyebrow instead of
    `font-semibold tracking-wider` Tailwind-default uppercase.
  - **BrandApplication dropped `--accent2` (purple) for coral.** This is
    the hardest-visible purple → coral swap — the right column of the
    header twin no longer turns purple in Nativz mode.

- **VideoIdeaCard** (inside topic rows):
  - Removed the `border-l-[3px] border-l-accent2` accent stripe (banned
    pattern + purple).
  - `viral_potential` now reads as a full-perimeter coral ring on the
    card + coral Badge variant. `high` gets a cyan ring.
  - Card lifts -1px on hover so the card system behaves uniformly.

- **Badge component** gained a `coral` variant. Use it when you want the
  brand's "accent / urgency" tone. Purple variant is still defined for
  backward-compat; new code should reach for coral.

- **topic-row-expanded** (each row inside the trending-topics table):
  - Virality scale: medium = cyan (brand), high = emerald (semantic
    success), viral_potential = coral (urgency). Was medium = blue, high
    = emerald, viral_potential = purple.
  - SOURCE_TYPE_ICON was a rainbow (blue / emerald / purple); muted all
    except video (cyan). "Icons are decoration — URLs are the signal."

### Dashboard suggestions list (`/admin/dashboard`)

- Removed the `border-l-[3px]` accent stripes on each suggestion row.
  The right-aligned priority Badge already communicates urgency; the
  stripe was redundant AI-design chrome on top of real signal.

### Search stats row (5-metric strip in the scraped-videos section)

- Dropped the rainbow icon accents (pink/emerald/purple). Only "Views"
  (the hero metric) keeps the cyan accent. Numeric value is now
  font-semibold tabular-nums; label is a mono caps eyebrow. Card lifts
  on hover to match the Infrastructure Stat treatment.

## Known drift I *didn't* touch (follow-up candidates)

These all use `text-accent2-text` / `bg-accent2-surface` = purple in
Nativz mode. Same principle: purple is CTA-only per `.impeccable.md`.
Touching these individually is straightforward but out of scope for this
autonomous pass:

- `components/results/competitive-analysis.tsx:57,63`
- `components/results/big-movers.tsx:10,17`
- `components/results/niche-insights.tsx:63,69`
- `components/results/action-items.tsx:31`
- `components/results/sources-panel.tsx:95`

The **actual CTAs** in `components/ideas-hub/*` correctly use `bg-accent2`
for purple CTAs — leave those alone. The root cause of this mess is that
`--accent2` is being dual-purposed as "CTA color" AND "generic secondary
accent." The real fix (not done this pass) is to introduce a dedicated
`--accent-secondary` token mapped to coral for decorative use, and leave
`--accent2 = purple` strictly for CTAs.

Also still carrying the banned `border-l-[3px]`:
- `components/ui/floating-dock.tsx:51-52` — nav active-state indicator.
  Debatable: the ban is about card accent stripes, not tab indicators.
  Leave unless it bothers you.

## Engineering changes in the same session (recap for context)

Not card polish, but shipped while fixing the research run Jack reported:

- **Pipeline parallel fetches** — per-subtopic URL reads now use
  `Promise.all`. Saves up to ~8s per subtopic.
- **Timer fix on processing screen** — elapsed counter no longer freezes
  at 9s when the API 202-polls. Shows real wall-clock.
- **SearXNG prod fallback** — default config now auto-switches to
  OpenRouter web search on Vercel when `SEARXNG_URL` is unset or
  localhost (SearXNG only runs locally on Jack's Mac mini). This fixes
  the "research_sources: 0 in every production run" bug.
- **Reddit/YouTube/Quora save bug** — `route.ts` was filtering
  `allPlatformSources` to TikTok-only before persisting to
  `platform_data.sources`. Now saves all non-TikTok sources (they're
  small — no transcripts) in batch 1 alongside the top 8 TikTok; batch 2
  carries the rest of TikTok up to the 50 cap. Reddit/YouTube/Quora
  cards should now render in the SourceBrowser.
- **TikTok stagger removed** — 300ms inter-batch comment delay + 150ms
  transcript delay stripped. Saves 2–5s per run depending on volume.

## What Jack should verify on return

1. Open `/admin/infrastructure` — confirm the polished Stat cards /
   `All via OpenRouter` badge / grouped legend on expanded rows.
2. Open any `/admin/search/[id]` completed run — confirm executive
   summary / brand application header twin icons are circles with
   eyebrow labels; no purple.
3. Drill into a trending topic with a video idea — confirm no left
   border stripe; viral_potential reads coral.
4. Run a fresh Trend Finder search to verify:
   - Research sources > 0 (SearXNG / OpenRouter fix)
   - Reddit / YouTube source cards appear in the SourceBrowser
   - Total wall-clock shorter by a few seconds on TikTok runs
5. Pull up Infrastructure Stage breakdown on that new run and look at
   whether `platform_scrapers` is still the 80% long-pole. If so, next
   lever is capping `VOLUME_CONFIG.medium.tiktok.transcriptVideos` from
   500 → 100 ish.

## How to roll back a specific commit if something looks wrong

```bash
git log --oneline -10                          # find the commit sha
git revert <sha>                               # non-destructive; new commit
git push origin main                           # Vercel auto-deploys
```

Avoid `git reset --hard` on main — use `git revert` so the rollback is
itself a new commit and nothing is lost. If the issue is isolated to one
card, revert just that commit; the others are independent.
