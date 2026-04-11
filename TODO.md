# Nativz Cortex — Task Queue

> Single source of truth for all dev work.
> Statuses: `[ ]` todo · `[🔄]` in-progress · `[x]` done
> **Calendar integration:** Using Nango for OAuth token management (Google Calendar). Custom native scheduler built in Cortex sends invites.

---

## Next Session — QA this April 11 Strategy Lab batch

> See **`SRL.md`** at repo root for the full self-referential loop log.

### ✅ Nerd chat — fixed (April 10), verified (April 11)
The two stacked upstream bugs (`list_tasks` schema converter dropping
`type: "object"` and `max_tokens` going to `gpt-5.4-mini` instead of
`max_completion_tokens`) were already resolved by commits `c3743f8` +
the `z.toJSONSchema` swap in `lib/nerd/registry.ts`. `api_error_log`
confirmed the last logged error was 2 min before the fix commit landed
and there have been zero errors since. `scripts/inspect-nerd-errors.ts`
and `scripts/smoke-nerd-tools.ts` committed as ongoing diagnostics.

### 🟡 QA — Strategy Lab artifact canvas (April 11 session)
- [ ] **Open in Strategy Lab from topic search results** — click the
  FlaskConical button on a completed search. With client: lands in lab
  with search auto-attached. Without client: opens client picker dialog,
  attach, lands in lab with search attached.
- [ ] **Multi-pin persists** — batch-select searches in research history,
  open the lab, chip bar should show ALL selected, not just the last.
- [ ] **Streaming mermaid** — send "build a content strategy map" prompt.
  While streaming, should show a "Rendering diagram…" skeleton. No
  "syntax error" flash on partial mermaid.
- [ ] **Mermaid click-to-zoom** — click any rendered diagram → modal
  opens with full-size render. Buttons: Copy source, Download SVG,
  Download PNG. PNG should rasterize cleanly via canvas.
- [ ] **HTML visual click-to-zoom** — same flow for ```html-visual
  blocks. Only Copy source (iframe is sandboxed).
- [ ] **GFM tables** — ask for "script A vs B comparison table",
  verify it renders as a proper dark-theme table, not raw pipes.
- [ ] **Artifact-style output** — quick-start prompts now push the
  model toward artifact-style responses (strategy map, 3 full scripts,
  effort-vs-impact quadrant, performance diagnosis).
- [ ] **System prompt teaches artifacts** — system addendum at
  `lib/nerd/strategy-lab-scripting-context.ts` now includes explicit
  guidance on mermaid + html-visual blocks and a 5-part artifact
  template. Verify the model follows it.
- [ ] **Conversation PDF** — export a full chat with a mermaid block.
  PDF should show "Mermaid diagram — open in Strategy Lab for the
  live render" above the raw source (full rasterizer is a future
  enhancement). Per-message PDF via html2canvas captures the SVG live.

### 🟢 Still open from iter 3 (SRL will regenerate)
- [ ] Validate analytics tool grounding — when user asks "diagnose my
  performance", verify the Nerd reaches for `get_analytics_summary`,
  `compare_client_performance`, `get_top_posts`.
- [ ] Full mermaid rasterizer inside `strategy-lab-conversation-pdf.tsx`
  so the full PDF export matches the per-message PDF.
- [ ] `scripts/smoke-markdown-tables.tsx` — could grow into a broader
  parser regression suite.

### 🟡 Audit — Stuck-at-92% fix + finish animation
- [ ] Your currently-stuck audit should auto-recover: refresh → GET self-heal flips it to Failed if >7min old, OR click Retry (process route now unblocks stale rows)
- [ ] Start a fresh audit end-to-end. Progress bar should move smoothly the whole way (no 2-min freeze at 92%). Finish animation ~1s.
- [ ] Kill dev server mid-audit → reload → audit should auto-fail within ~7min on next GET
- [ ] Verify competitor discovery now caps at 150s (check logs for `competitor discovery exceeded 150s budget` warnings on long runs)

### 🟡 Research — New features
- [ ] **Public share link**: Three-dots → Copy link to search → paste in incognito → loads WITHOUT login. Works on completed only; pending should show "still running" toast.
- [ ] **Bulk share**: Selection mode → Copy link to all → paste → newline-separated public URLs
- [ ] **Selection rework**: Right-click → Select. Instructional box should be gone. Click rows to toggle (not navigate). Bulk panel = Copy all + Delete all only (no more "Bring to Strategy lab" or "Open all in lab")
- [ ] **Brand persistence**: Pick brand → click report → back → still selected. Also fresh tab. Also clear brand → click report → back → still cleared.
- [ ] **Completion toast**: Start search, wait. NO auto-nav. Toast bottom-right with "View results" button. Processing card done state shows "View results" button.

### 🟡 History rails — Stuck icons
- [ ] Audit rail: watch in-flight audit icon update within ~5s of completion
- [ ] Research rail: multiple concurrent searches should ALL update, not just the first

### 🟢 Cosmetic — Admin Nerd polish + audit icons
- [ ] `/admin/nerd` should now look like Strategy Lab (bigger fonts, rounded research-style input, welcoming empty state with rounded icon square, soft client badge pill)
- [ ] Start audit → "Confirm social platforms" screen should show real platform marks (TikTokMark, InstagramMark, FacebookMark, YouTubeMark), not colored dots

### 🟢 Claude-style composer rework (blocked on Nerd fix)
- [ ] Attachment tray above input with chips (research, PDFs, images, files) + ✕
- [ ] Paperclip menu: Upload file / Attach research / Attach knowledge entry / Attach moodboard
- [ ] Drag-and-drop anywhere on chat pane
- [ ] PDF parsing (`pdf-parse` or similar) → indexed as temporary context chunk
- [ ] Image support (vision model input)
- [ ] Citations linking back to attached doc chips
- [ ] Reuse composer component across `/admin/nerd` and Strategy Lab so both get the upgrade at once

### From earlier sessions (still open)
- [ ] Frame extraction debugging — ffmpeg-static works locally but carousel returns 0 frames
- [ ] Video reference library in Strategy Lab Knowledge Base tab
- [ ] QA all 4 Apify scrapers live end-to-end
- [ ] Analytics: client portfolio, social/affiliates/benchmarking tabs, competitor add/refresh/charts, status dots
- [ ] Calendar webhooks: test with real Google Chat URL, verify firing on feedback events
- [ ] Research: suggest topics ontology, history rail client filter with load-more, PDF export matches results page, share links domain-aware

---

## Completed — April 11 Session (Strategy Lab artifact canvas)

### Nerd chat diagnosis (SRL iter 1 prelude)
- [x] `scripts/inspect-nerd-errors.ts` — query `api_error_log` via Supabase REST (direct DB host is gone) to triage future LLM regressions
- [x] `scripts/smoke-nerd-tools.ts` — asserts all 48 nerd tools emit `type: "object"` + token-field regex sanity for gpt-5.4-mini / gpt-4.1 / o-series
- [x] Confirmed prior `list_tasks` schema bug + `max_tokens` on gpt-5.4-mini bug were both fixed by `c3743f8` before this session — zero errors in `api_error_log` since

### Artifact-first chat (SRL iter 1)
- [x] Open in Strategy Lab button on `app/admin/search/[id]/results-client.tsx` — pre-pins the current search in localStorage and jumps to `/admin/strategy-lab/[clientId]`
- [x] `lib/nerd/strategy-lab-scripting-context.ts` addendum now teaches the Nerd to produce ```mermaid flowcharts, ```html-visual comparisons, and 5-part artifact outputs (title → tl;dr → visual → sections → next actions); includes mermaid syntax rules
- [x] Quick-start suggestion pills rewritten for artifact outputs (strategy map, 3 scripts, effort/impact quadrant, performance diagnosis)
- [x] `components/strategy-lab/pdf-markdown.tsx` — code-block parser tracks language so mermaid / html-visual get labeled in the full conversation PDF instead of silently dumping raw source

### Streaming safety + zoom modal (SRL iter 2)
- [x] `components/ai/markdown.tsx` — unclosed ```mermaid / ```html / ```html-visual fenced blocks render a "Rendering diagram…" skeleton instead of handing partial code to the live renderers (no more syntax-error flash while streaming)
- [x] `components/ai/artifact-zoom-modal.tsx` — Claude-web-style canvas with Copy source, Download SVG, Download PNG (canvas rasterization), reuses the same MermaidDiagramBlock / HtmlVisualBlock renderers with `disableZoom` so the modal body doesn't stack expand buttons
- [x] `components/ai/rich-code-block.tsx` — hover Expand affordance + cursor-zoom-in on the inline diagram blocks, lazy-imports the modal so the default bundle doesn't pull it in
- [x] `components/strategy-lab/strategy-lab-workspace.tsx` — hoisted to full multi-pin state: `pinnedTopicSearchIds: string[]` loaded from localStorage, pruned against current searches, chip bar gets the real array instead of only `ids.at(-1)`

### GFM tables + client picker (SRL iter 3)
- [x] `components/ai/markdown.tsx` — GFM table parser: header-row + divider-row lookahead, contiguous data rows, dense dark-theme styling that reads well in the chat column
- [x] `scripts/smoke-markdown-tables.tsx` — parser-level assertion suite (renderToStaticMarkup + regex) that caught two mid-build bugs (divider flushed the buffer on entry; `<th` regex accidentally matched `<thead`)
- [x] `PATCH /api/search/[id]` — third branch: `{ client_id }` attaches an unattached topic search to a client, with existence check + activity log
- [x] `components/strategy-lab/strategy-lab-attach-client-dialog.tsx` — searchable client picker that opens from the Open in Strategy Lab button when the search has no client_id, attaches + pins + navigates in one click

---

## Completed — April 10 Session

### Audit — Stuck-at-92% bug + full fix
- [x] Root cause: competitor discovery could burn 18+ min worst-case, blowing past Vercel's 300s function limit. Killed function → audit row stuck in `processing` forever → frontend polled indefinitely.
- [x] GET `/api/analyze-social/[id]` self-heals audits with `updated_at > 7min` → auto-flips to `failed`
- [x] POST `/api/analyze-social/[id]/process` now allows retry on stale processing rows (previously 409'd) + clears `error_message` on restart
- [x] `lib/audit/discover-competitors.ts` — hard 150s time budget on discovery loop
- [x] `components/audit/audit-report.tsx` — 1.5s poll (was 2.5s), cache: no-store, unmuted catch, 7-min client-side safety net, 900ms finish animation (was 2.4s), progress curve normalised over 4 min
- [x] Lint cleanup: removed unused recharts/lucide imports, dead write-only state, unused PlatformDetail prop

### Audit — UI polish
- [x] Standardized platform icons on "Confirm social platforms" screen (replaces colored dots with real platform marks)

### Research — Public share links
- [x] `copyLinkToSearch` in history-feed mints share tokens via `/api/search/[id]/share` → public `/shared/search/<token>` URL (no login required)
- [x] `copyAllSelectedLinks` does the same for bulk selections
- [x] Guards incomplete searches with fallback to internal link + explanatory toast

### Research — Selection behavior rework
- [x] Removed "Right-click a topic search → Select…" instructional help box
- [x] Rows in selection mode toggle selection on click (button wrapper instead of Link)
- [x] Bulk panel: only "Copy link to all" + "Delete all" (removed "Bring to Strategy lab" and "Open all in lab")
- [x] Context submenu simplified the same way
- [x] Dropped unused `openAllSelectedInStrategyLab` callback + dead-code folder submenu

### Research — Brand persistence
- [x] `selectedClientId` persists to localStorage key `cortex:research-hub:selected-client-id`
- [x] Null stored as literal `"null"` so explicit clear also sticks
- [x] Stale client IDs validated and silently dropped
- [x] `ResearchTopicForm` has new `initialClientId` prop that rehydrates brand pill, context mode, and context search field

### Research — Completion toast (no auto-open)
- [x] `goToResults()` no longer auto-navigates. Fires sonner toast with "View results" action button
- [x] Processing card done state shows "View results" button instead of auto-redirect text

### History rails — Stuck processing icons
- [x] `components/audit/audit-history-rail.tsx` — ref-based polling effect (5s cadence), only propagates changes when something actually changed
- [x] `components/research/research-hub.tsx` — parallel poll all in-flight IDs each tick; stops only when ALL are settled. 5s → 3s interval.

### Admin Nerd — Visual polish
- [x] `PromptInput variant="research"` (wide rounded pill)
- [x] `max-w-3xl` content column, `divide-y` message separators
- [x] Welcoming empty state: rounded icon square + `text-2xl` heading + `@`/`/` helper copy
- [x] Neutral header, soft border client pill, bigger mention chips

### Nerd — Latent bug (background agent finding)
- [x] `lib/ai/openai-model-id.ts` — `openAiChatCompletionTokenFields` was missing `gpt-4.1` in its max-completion-tokens detection (diverged from the nerd route's inline check). Fixed so both sites match — plugs a gap for features using the shared helper with 4.1 models.

---

## Completed — April 9 Session (Part 2)

### Audit — Scraper & Source Browser Fixes
- [x] Website scraper — improved social link detection: two-pass extraction (regex + href parsing), added `m.facebook.com`, `fb.com`, protocol-relative URL support, expanded exclusion list
- [x] Instagram scraper — verified input format (passes both `urls` and `usernames`, already correct)
- [x] TikTok scraper — verified input format (`profiles` array with full URLs, correct)
- [x] Facebook scraper — made actor configurable via `FACEBOOK_SCRAPER_ACTOR` env var, added flexible field extraction for different actor output formats, reduced results limit for cost savings
- [x] Source browser — added Facebook platform support (colors, labels, filter button), dynamic platform filter (only shows platforms with data)
- [x] Source browser — fixed YouTube aspect ratios: Shorts (≤180s or `/shorts/` URL) now correctly show as 9:16 vertical

### Audit — PDF Export & Share Links (NEW)
- [x] Audit PDF export — 3-page dark-themed PDF via @react-pdf/renderer (overview + scorecard + platforms/competitors)
- [x] Export PDF button in audit report header
- [x] Audit share links — full CRUD API at `/api/audit/[id]/share` (GET/POST/DELETE)
- [x] DB migration `095_audit_share_links.sql` — `audit_share_links` table with RLS
- [x] Share button in audit report header
- [x] Shared audit page at `/shared/audit/[token]` — read-only public view with full report

### Research — Background Notifications
- [x] Background search tracker — React context provider with polling
- [x] Toast notification when search completes in background (user navigated away)
- [x] "Go back" button on processing page registers search for background tracking
- [x] Toast includes "View results" action button

### Research — Rescript Fix
- [x] Carousel rescript — now passes `clientId` for brand context to `/api/analysis/items/[id]/rescript`

---

## Completed — April 9 Session

### Sales Audit Tool (NEW)
- [x] Website-first flow — paste URL, auto-detect social profiles
- [x] Platform confirmation screen — shows detected platforms, lets user add missing ones
- [x] TikTok scraper (apidojo/tiktok-profile-scraper via raw Apify fetch)
- [x] Instagram scraper (apidojo/instagram-scraper-api via raw Apify fetch)
- [x] Facebook scraper (apify/facebook-posts-scraper via raw Apify fetch)
- [x] YouTube scraper (YouTube Data API — channel info + recent Shorts)
- [x] Parallel platform scraping
- [x] AI competitor discovery + competitor profile scraping
- [x] Scorecard with green/yellow/red dots (posting frequency, engagement, avg views, hashtags, content variety, bio optimization, follower-to-view ratio, caption optimization, content quality)
- [x] Recharts: engagement rate over time, views per post per platform
- [x] Competitor comparison charts (avg views + engagement rate horizontal bars)
- [x] Smart aspect ratios (YouTube Shorts 9:16, long-form 16:9, TikTok/IG always 9:16)
- [x] VideoGrid source browser with platform filtering
- [x] History rail with right-click context menu, bulk select, delete, search
- [x] Smooth progress bar (eased curve, animated finish to 100%)
- [x] Encrypted text stage animation during processing
- [x] Admin-only access (ADMIN_ONLY_HREFS)
- [x] DB migration: prospect_audits + social_urls + videos_data columns
- [x] `needs_social_input` + `confirming_platforms` status flow

### Analytics Overhaul
- [x] Client portfolio selector with green/yellow status dots
- [x] Merged social + affiliates into tabbed view (Social | Affiliates | Benchmarking)
- [x] Benchmarking: add/discover competitors, Apify scraping, snapshots, historical charts
- [x] Old /admin/analytics/social and /affiliates redirect to consolidated page

### Calendar Revision Webhooks
- [x] Google Chat webhook on feedback submission
- [x] Configurable webhook URL per client in settings
- [x] lib/webhooks/revision-webhook.ts
- [x] /api/clients/[id]/webhook-settings API

### Users/Team Consolidation
- [x] Merged Team into Users page with Team filter tab + role badges
- [x] Bumped font sizes across Users page
- [x] Sort controls (name, role, team, last active, searches)
- [x] /admin/team redirects to /admin/users

### Research Improvements
- [x] Suggest topics button (AI generates brand-specific ontology topics when client selected)
- [x] History rail filters by selected client
- [x] Removed folders section from history rail
- [x] Delete completed searches enabled
- [x] Talking head & reaction content pillar added to clustering prompt
- [x] Encrypted text stage animation on processing page
- [x] Keyword picker centered + font sizes bumped
- [x] "Processing" badge removed from history rail (just spinner)

### Share Links & PDF
- [x] Share URL uses request origin (AC domain → AC links, Nativz → Nativz)
- [x] Share view includes AiTakeaways, SourceBrowser (matches admin page)
- [x] Removed BigMovers + CompetitiveAnalysis (not rendering)
- [x] PDF overhauled — 3 pages matching results page with two-column layouts
- [x] PDF brand detection from domain (AC green vs Nativz blue)

### UI/UX
- [x] Global cursor-pointer on all buttons/links via CSS
- [x] "Why this video works" removed from video detail panel (was just repeating caption)
- [x] "Short-form videos" renamed to "Videos — across all platforms"
- [x] AI model fixed across all agencies (openai/gpt-5.4-mini in all model columns)
- [x] Sidebar: "Sales audit" → "Audit", Team removed, Analytics no dropdown

---

## Active Work

### Strategy Lab "brain" + Nerd context (see `docs/prd-strategy-lab-brain.md`)
- [x] PRD with phased backlog + implementation log
- [x] `buildStrategyLabContextPack` + append when client is @mentioned in Nerd
- [x] Analytics `/admin/analytics/social?clientId=` preselect + assistant card link
- [x] Remaining PRD phases implemented

### Static Ad Generator (built 2026-03-18, QA'd 2026-03-19)
- [x] Full pipeline built and QA'd
- [ ] Sync Desktop Kandy folders to site

---

## Completed Epics

- **EPIC 1** — Client Score System (health_score ratings)
- **EPIC 2** — Client Profile Rework (contacts, team, assignments, services)
- **EPIC 3** — Dashboard Rework (activity feed, todos, upcoming shoots)
- **EPIC 4** — Team Board (team management, assignments)
- **EPIC 5** — Shoot Scheduler (Nango + Google Calendar)
- **EPIC 6** — Task & Workflow Management (Monday replacement)
- **EPIC 7** — Social Media Reporting Dashboard (cross-platform analytics)
- Brave Search, dual dashboard, search flow, approval system, portal invites, ideas, vault integration
- **Knowledge System** — Vault layout, semantic search, wikilinks, entity linking, Gemini embeddings
- **Ideas Hub** — Generation, triage, saved ideas, reference videos, script generation
- **Unified Research Hub** — Combined brand/topic research + idea generation
- **AI/Nerd Tools** — Knowledge tools, Fyxer integration, meeting import, usage tracking
- **Client Profiles** — Connected accounts, agency badges, Google service account support
- **Todo Widget** — Centered empty state with add task button

## Future
- [ ] Set up Google OAuth (Sign in with Google) for admin users
- [ ] Instagram + Facebook scrapers for research pipeline (not just audit)
- [ ] Audit PDF export
- [ ] Calendar share improvements (Section 3 of original PRD)
- [ ] Recurring benchmarking scrapes (cron-based, admin-controlled)
