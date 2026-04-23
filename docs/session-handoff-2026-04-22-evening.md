# Session handoff — 2026-04-22 evening (autonomous block #2)

Jack popped back briefly with five course corrections, then went away again
for a few hours. This is what shipped while he was gone. Builds on top of
[`docs/session-handoff-2026-04-22-cards.md`](./session-handoff-2026-04-22-cards.md).

## Course corrections received

1. **Research console was leaking secrets** — lines like
   "querying SearXNG · DuckDuckGo backend", "persisting to topic_searches",
   "verifying every citation against the allowlist" exposed internal tool
   names, table names, and proprietary scoring approaches in a customer-
   facing surface. Plus alignment looked off (some lines appeared
   indented further than others).
2. **No coral anywhere** — yesterday's "purple is CTA only, use coral
   for secondary accent" push was wrong; Jack doesn't want coral as
   decoration either. Cyan should dominate. Coral kept only for true
   error/failure semantic states (StatusPill `failed`, HealthDot `error`).
3. **B (TikTok perf cap) is the priority** for autonomous work.
4. **Rename "Competitor intelligence" → "Competitor spying"**, swap the
   icon to something more "watching", and figure out why the page felt
   slow loading from the sidebar.
5. **Rename "Content calendars" → "Scheduling"** in the sidebar.
6. **Audit admin pages for QoL drift.**

## What shipped (in order)

Each bullet = one commit on `main` → Vercel auto-deploy.

### `fix(loader): research console — broad-strokes copy, no internal leaks` (99ed486)

Replaced every internal-leak line with broad marketing-register copy.
Examples:

| Before (leaked internals) | After (broad strokes) |
|---|---|
| `querying SearXNG · DuckDuckGo backend` | `scanning the open web` |
| `fanning out URL fetches` | `reading top sources` |
| `reading page text into evidence buffer` | `pulling key passages` |
| `computing URL similarity` | `comparing what we found` |
| `verifying every citation against the allowlist` | `shaping the narrative` |
| `serializing the JSON payload` | `polishing the layout` |
| `persisting to topic_searches` | `putting it all together` |
| `cortex pipeline · llm_v1 — opening session` | `starting your research session` |

Tag column also genericized: `WEB / EXPLORE / DEDUPE / SYNTH / IDEAS / BUILD`
→ `SEARCH / THINK / CHECK / WRITE / IDEAS / BUILD`. Action verbs read as
"we are working" without naming pipeline phases.

Comment in the file makes the contract explicit so a future contributor
doesn't reintroduce internal tool names "for accuracy".

**Alignment fix:** added explicit `w-[64px]` timestamp + `w-[72px]` tag
columns + `items-baseline` on the row + defensive `.trim()` on every
emitted text string. Message text now starts at the same horizontal
position regardless of tag length.

### `revert(brand): pull coral back out of decorative slots — cyan everywhere` (72fc99a)

Reversed the previous coral-as-secondary-accent push:
- **BrandApplication header twin**: icon + eyebrow back to brand cyan.
  Differentiation from ExecutiveSummary is now icon (Sparkles vs Target)
  + heading text only.
- **VideoIdeaCard `viral_potential`**: `coral` Badge → `info` (cyan).
  Ring intensity is now the differentiator (`ring-accent/50` vs
  `ring-accent/20` for `high`).
- **topic-row-expanded virality chip**: coral text/dot → `cyan-200`.
  Brighter cyan stands out on the surface without leaving brand.

Coral kept where semantically appropriate: StatusPill `failed`,
HealthDot `error`. Red-family for failure is a stronger UX convention
than the brand-color rule.

### `perf + sidebar QoL: TikTok cap + Competitor spying rename + skeleton` (94ee7d1)

**Performance** (the actual long pole on Jack's "immersive art attraction"
run — platform_scrapers ate 80% of wall-clock):

| Tier | tiktok.videos | tiktok.commentVideos | tiktok.transcriptVideos |
|---|---|---|---|
| **before** medium | 500 | 50 | **500** |
| **after** medium | 200 | 30 | **50** |
| **before** deep | 500 | 100 | 30 *(typo — lower than medium)* |
| **after** deep | 500 | 100 | 100 *(coherent ramp)* |

Estimated impact: ~90s shaved off the next medium-volume run, with
negligible report quality loss (the merger LLM consumed the first ~30
transcripts heavily on prior runs and the long tail was noise).

**Sidebar:**
- `Competitor intelligence` → `Competitor spying` (Jack's preferred
  irreverent register).
- Icon `ScanSearch` → `Telescope` (reads as surveillance, not "search").
- `Content calendars` → `Scheduling` (matches `/admin/scheduler` route
  + the actual H1 inside `scheduler-content.tsx` which was already
  "Scheduling" — the sidebar label was stale).
- `Brand Profile` → `Brand profile` (sentence-case per CLAUDE.md).
- Removed unused `ScanSearch` import.

**QoL:** added `loading.tsx` skeleton for `/admin/competitor-intelligence`.
Previously the page had no skeleton, so navigating from the sidebar
showed a blank surface until the server-side queries resolved (Jack's
"doesn't load in the sidebar" complaint).

## Admin route skeleton coverage (post-pass)

I audited every admin route. Coverage:

- ✓ All product routes have `loading.tsx`: dashboard, analytics,
  ad-creatives, ad-creatives-v2, analyze-social, brand-profile, calendar,
  clients, **competitor-intelligence (new)**, ideas, infrastructure,
  knowledge, meetings, nerd, notes, notifications, pipeline,
  presentations, scheduler, settings, shoots, strategy-lab, tasks, team,
  tools, users, accounting.
- ✗ Auth-only routes (don't need them): login, forgot-password,
  reset-password.
- ✗ Onboarding — out of scope this pass; Jack/parallel work was
  actively touching it.

## Things I scanned and intentionally left alone

- **Dashboard + notifications**: scanned for purple/coral/border-l drift
  — clean.
- **Brand profile + Knowledge (Brain)**: well-structured, no obvious
  drift.
- **Scheduler `H1`**: already says "Scheduling" — the sidebar rename
  brought the nav label into alignment.
- **Portal "Content calendar"** (`app/portal/calendar/page.tsx`): kept
  as-is. Different concept from admin "Scheduling" — the portal version
  is the client-visible deliverable.
- **Monday.com "Content Calendars" board name**: kept as proper-noun
  reference to the external integration's actual board name.
- **`components/results/{competitive-analysis,big-movers,niche-insights,
  action-items,sources-panel}.tsx`** still use `accent2-text`/`bg-accent2-
  surface` (= purple in Nativz). Jack's earlier feedback was "purple is
  fine but use sparingly," so leaving these for now. Real fix needs the
  `--accent-secondary` token refactor.

## Verification on return

1. **Open the Trend Finder loader on a fresh search.** The terminal
   should now read:
   - `START` opener instead of `INIT cortex pipeline · llm_v1`
   - `SEARCH / THINK / WRITE / IDEAS / BUILD` action tags
   - Lines like `scanning the open web`, `drafting the summary` instead
     of the old internal-leak set
   - All message text aligned at the same column
2. **Open any results page.** Brand application card on the right side
   of the executive-summary twin should now read cyan, identical
   treatment to the executive-summary card on the left.
3. **Scroll to a video idea with `viral_potential`.** Should have a
   bright cyan ring around the whole card and a cyan badge — no coral
   anywhere.
4. **Click "Competitor spying" in the sidebar.** New telescope icon;
   skeleton flashes immediately, then the real page lands. Renamed.
5. **Click "Scheduling" in the sidebar.** Renamed from "Content
   calendars".
6. **Run a fresh search and watch the next Infrastructure stage
   breakdown.** `platform_scrapers` should drop from ~3m 19s towards
   ~1m 30s ish on a medium-volume TikTok-heavy run.

## Out-of-scope follow-ups (for whenever)

- **Add `--accent-secondary` token** mapped to coral (Nativz) / orange
  (AC). Cleans up the root cause of the `accent2 = purple = decorative-
  purple-everywhere` problem. Would unblock a clean pass on the 5
  remaining components I noted above.
- **Skeleton for `/admin/onboarding`** — the only product route still
  missing one.
- **Surface SERP fallback reasons in Infrastructure** — when SearXNG
  fails or returns 0 hits, show "3/5 subtopics fell back to llm_only"
  on the row. Makes the "research_sources: 0" mystery debuggable next
  time.
- **Move long-running pipeline retry loop to Vercel Workflow** — the
  posttooluse hook keeps flagging this, and it would unlock proper
  pause/resume/crash-safe execution. Bigger refactor.
