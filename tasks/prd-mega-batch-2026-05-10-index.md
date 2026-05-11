# PRD Mega Batch, 2026-05-10

> 26 PRDs across 3 product surfaces. Drafted in one pass for review + sequencing.

## Why this batch exists

Three product threads that have been talked about but never written down:

1. **Viral Format Finder (VFF)** — a Netflix-style discovery surface for short-form video formats, brand-aware, that feeds Content Lab + topic plans.
2. **Spying → Prospect Pipeline (SPY)** — evolve the existing audit/spying tool into a sales engine: quick onboarding, initial analysis, competitor benchmarking, recurring monitoring, convert-to-client, then swap scrape data for Zernio data.
3. **Zernio Analytics (ZNA)** — the analytics surface that converted clients see. High-level, useful, no posting-time noise.

Each PRD includes Purpose & Value, Problem, Primary User, SMART Goals, User Stories, In/Out of Scope, Architecture Wiring, Open Questions, Assumptions, Done When.

## File map

### Viral Format Finder · 10/10

- `prd-vff-01-scaffolding.md` — Tables, RLS, sidebar entry, empty-state shell.
- `prd-vff-02-brand-awareness.md` — `brand_format_context` (seed terms, excluded terms, pillar weights, embeddings).
- `prd-vff-03-video-sourcing.md` — Cost-capped scraping cron (Apify), 50 videos/brand/day target, dedup, persistence.
- `prd-vff-04-junk-filter.md` — Two-stage filter (heuristic + LLM) targeting ≥55% rejection.
- `prd-vff-05-video-analysis.md` — Gemini 2.5 Flash analysis, structured schema, ≤$0.02/video, embedding.
- `prd-vff-06-format-taxonomy.md` — Seeded hook_type / structure / archetype / pacing slugs + LLM proposal queue.
- `prd-vff-07-netflix-ui-shell.md` — Hero + rows (For You, Trending, Top hooks, etc.), brand pill, 8 row strategies.
- `prd-vff-08-thumbnail-card.md` — 9:16 cards, title + engagement hook descriptor overlay, platform-tinted fallback.
- `prd-vff-09-detail-view.md` — Modal via parallel routes, "Use this format" handoff, save/pin/dismiss actions.
- `prd-vff-10-content-lab-integration.md` — `create_topic_plan({ format_slug })`, `resolve_format()` Nerd tool, portal version.

### Spying → Prospect Pipeline · 10/10

- `prd-spy-01-prospect-scaffolding.md` — `prospects` + `prospect_socials` + `prospect_touchpoints` + lifecycle states.
- `prd-spy-02-quick-onboarding.md` — Sub-30s prospect record creation reusing audit scrape primitives.
- `prd-spy-03-initial-analysis.md` — Structured "current state" analysis stored in `prospect_analyses`.
- `prd-spy-04-checklist-scorecard.md` — Deterministic 10-item R/Y/G scorecard + branded PDF + share link.
- `prd-spy-05-competitor-analysis.md` — Reuses `scrapeProvidedCompetitors`; benchmarks prospect vs N competitors.
- `prd-spy-06-recurring-monitor.md` — Vercel Workflow / DurableAgent run; tracks deltas; emits alerts.
- `prd-spy-07-prospect-to-client.md` — Convert prospect → client (FK lineage), reuse `invite_tokens`.
- `prd-spy-08-zernio-data-swap.md` — `resolveAnalyticsSource()` router; zernio vs scrape adapters.
- `prd-spy-09-sales-presentation-mode.md` — Internal + public present routes; 6-panel narrative deck.
- `prd-spy-10-stickiness-layer.md` — Weekly competitor digests + monthly format reports; approval queue per memory rule.

### Zernio Analytics · 6/6

- `prd-zna-01-daily-snapshots.md` — `platform_snapshots`, 02:00 UTC cron, backfill script.
- `prd-zna-02-growth-charts.md` — Recharts line per platform; 7d/30d/90d/All toggle; delta callouts.
- `prd-zna-03-ai-insights-pulse.md` — ≤4 sentences, banned-topic prompt constraints, 15% delta gate.
- `prd-zna-04-post-grid.md` — Persisted thumbnails (Supabase Storage), 9:16 grid, filter + sort.
- `prd-zna-05-post-good-bad-signal.md` — Above/avg/below dot vs rolling 30d brand baseline.
- `prd-zna-06-engagement-trajectory.md` — Per-post sparkline + status pill (still_climbing / peaked / declining / dead).

## Cross-series wiring

The three series intentionally feed each other:

- **VFF-10 → SPY-05.** When competitor analysis surfaces a competitor's video, the format taxonomy applied by VFF-05/06 lets us say "this competitor uses 3x more comparison-hook content than the prospect" instead of vibes.
- **SPY-08 → ZNA-01.** The Zernio data swap router reads what ZNA-01 writes. SPY-08 ships the abstraction; ZNA-01 ships the writer.
- **ZNA-04 → ZNA-05 → ZNA-06.** Same post-grid card gets progressively annotated: thumbnail (04), good/bad dot (05), trajectory sparkline + status pill (06).
- **VFF-02 → SPY-03.** Brand context built for VFF (`brand_format_context`) also informs the initial prospect analysis (SPY-03) — same seed-term scaffolding.

## Suggested build sequence

Phase by phase, not series by series. Each phase ends ship-ready.

**Phase A · Foundations**
- VFF-01 (tables + sidebar empty state)
- SPY-01 (prospect tables + lifecycle)
- ZNA-01 (daily snapshot cron + table)

**Phase B · Inputs that fill the foundations**
- VFF-02 (brand format context)
- SPY-02 (quick onboarding flow)
- ZNA-02 (growth charts read snapshots)

**Phase C · The analysis layers**
- VFF-03 → VFF-04 → VFF-05 → VFF-06 (sourcing → filter → analyze → taxonomy)
- SPY-03 → SPY-04 (initial analysis → scorecard PDF + share link)
- ZNA-03 (insights pulse) + ZNA-04 (post grid)

**Phase D · Comparison + signal**
- SPY-05 (competitor analysis)
- ZNA-05 (good/bad signal)
- ZNA-06 (engagement trajectory)

**Phase E · Surface + handoff**
- VFF-07 → VFF-08 → VFF-09 → VFF-10 (Netflix UI, cards, detail view, content-lab handoff)
- SPY-06 (recurring monitor, durable workflow)
- SPY-09 (sales presentation mode)

**Phase F · Lifecycle close**
- SPY-07 (prospect → client conversion)
- SPY-08 (Zernio data swap router) — depends on ZNA-01 writing data
- SPY-10 (stickiness layer / digests)

## Open meta-questions

1. **Do we commit these PRDs to main or keep in worktree as drafts?** Default: commit as drafts; the file path makes it obvious they aren't built yet.
2. **Linear?** Should each PRD become a Linear issue under a parent epic per series (3 epics, 26 issues)? Default: yes, once you've reviewed.
3. **Sequencing override.** If client value > internal value, ZNA series jumps ahead of VFF (clients see ZNA on their portal; VFF is internal-first). Default: build VFF and SPY in parallel for internal use; ZNA-01 + ZNA-02 ship as a fast strike to give clients the line chart.
4. **Naming.** "Viral Format Finder" is the working name; "Spying" is the legacy name for SPY-* (prospect pipeline is the real product). Open to rename SPY-* to PROSP-* or PIPE-* before issues are filed.

## Assumptions across the batch

- Apify, Gemini, OpenRouter, Zernio quotas all hold at projected volumes (per-PRD budgets are conservative).
- Brand profiles + content pillars are populated for active clients (VFF-02 + SPY-03 lean on this).
- Supabase Storage egress remains free-tier-tolerable for thumbnail persistence (ZNA-04, VFF-08).
- Vercel Workflow DevKit / DurableAgent is the right substrate for SPY-06 (recurring monitor); not used elsewhere unless a reliability gap appears.

## Done When

- Jack has reviewed all 26 PRDs and either approved-as-is, requested edits, or filed them as Linear issues.
- A build order is agreed (default above unless overridden).
- Cross-series wiring (VFF→SPY, SPY→ZNA) is confirmed so we don't ship duplicates of the same abstraction.
