# Nativz Cortex — Task Queue

> Single source of truth for all dev work.
> Statuses: `[ ]` todo · `[🔄]` in-progress · `[x]` done
> **Calendar integration:** Using Nango for OAuth token management (Google Calendar). Custom native scheduler built in Cortex sends invites.

---

## Branded deliverable PDFs — April 15

Shared `@react-pdf` template at `lib/pdf/branded` — theme-swappable Nativz / AC, covers + series + topic cards + legend, driven by `BrandedDeliverableData`. See `project_branded_pdfs.md` in memory.

**Shipped:**
- [x] `lib/branding/` single-source agency tokens (colors, logos, fonts). Fixes the stale `#6366F1` indigo in `AGENCY_CONFIG`.
- [x] `lib/pdf/branded/document.tsx` template with cover / legend / series / topic-card primitives. `AccentRule` = single full-width teal line under every section / series title.
- [x] Admin preview route: `GET /api/admin/pdf/preview/branded-deliverable?theme=nativz|anderson&download=1`.
- [x] Local render script: `npx tsx scripts/render-branded-preview.tsx` → writes both themes to `~/Desktop`.
- [x] Font registration — Rubik + Roboto + Poppins TTFs in `/public/fonts`. Nativz uses Poppins everywhere (matches nativz.io); AC uses Rubik + Roboto (matches ac-docs). All `fontFamily` declarations read from `theme.fonts`, zero hardcoded families.
- [x] Logos as JPGs flattened onto white in `/public/{nativz,anderson}-logo-on-light.jpg`. The base64 `AC_LOGO_PNG` in `lib/brand-logo.ts` produces a horizontal glitch when `@react-pdf` decodes it — no combination of PNG re-encoders fixes it. Workaround: rasterize directly from `/public/anderson-logo-dark.svg` via `@resvg/resvg-js`, flatten to JPG via `sharp`. Reusable via `npx tsx scripts/rasterize-logos.ts`.
- [x] `.gitignore` allowlist for branded logo assets.
- [x] **QA pass (April 15)** — both themes render cleanly. Nativz: blue "nativz" wordmark with arrow, Poppins throughout. AC: teal monogram + "ANDERSON COLLABORATIVE" wordmark, Rubik titles, Roboto body. All teal accent rules visible. Running header + footer correct on all pages.

**Shipped April 16:**
- [x] `/generate` slash command registered + Tab-complete + interactive multi-step flow
- [x] `/generate` skill seeded in DB (`docs/skills/generate.md`)
- [x] `/api/topic-plans/[id]/pdf` swapped to branded template via `mapTopicPlanToBranded`
- [x] `mapTopicPlanToBranded` + `mapIdeasToBranded` adapters. Title = TYPE in all caps.
- [x] Sidebar gear highlights on all settings routes. Closing endmark on PDFs.

**Still open:**
- [ ] **Migrate remaining 11 PDF templates** to branded shell — search results, audit, social report, brief, analysis, affiliate, strategy, conversation export, artifact export. Each needs an adapter in `lib/pdf/branded/adapters.ts`.
- [x] **Auto-export swap** — Resolved May 2026: the auto-export effect was already removed in commit `27da4f5c` because the `create_topic_plan` tool now ships a branded download card via `topic-plan-artifact-card.tsx`. Dead `looksLikeVideoIdeasResponse()` helper deleted from `export-conversation-pdf.ts`; the manual "Export PDF" button still uses `ContentLabConversationPdf` and gets covered by the broader "Migrate remaining 11 PDF templates" item above.
- [ ] **Phase 2b — Goodjin skill-improvement loop UI.** Schema `ai_skill_proposals` shipped; admin-review UI not built.
- [ ] **Composable skill graph (stretch).** Skills referencing other skills — architecture supports it, loader not wired.

---

## Audit report — Pushes A + B (April 15) — needs human QA

Both pushes shipped. Run a fresh audit on Vercel and verify each item.

**Push A — `1c4b706` (layout + scoring):**
- [ ] Brand overview card stacks prospect on top + competitors under "Benchmarked against"; TT/IG/YT badges link out to each profile
- [ ] Platform tabs (TT/IG/YT) appear directly under the brand overview, no duplicate set elsewhere
- [ ] Scorecard list: each dimension is a parent card with sub-rows for prospect + each competitor (R/Y/G dot + value)
- [ ] Removed: Export PDF, Attach to client, "couldn't scrape" amber, Executive summary, X/100 score, dual bar charts, head-to-head matrix toggle, prospect bio block
- [ ] LinkedIn + Facebook absent from confirm-platforms input form
- [ ] Scoring thresholds applied: posting freq green ≥8/mo (yellow 4-7, red <4); engagement green >3% (yellow 1-3%, red <1%)

**Push B — `a9e7654` (data + scraper fixes) + `a88f7cc` (Apify platform search):**
- [ ] Run an audit on a brand whose competitors don't expose social icons in their site footer — Apify platform search should find their TikTok / IG / YT handles via profile-scraper guessing + YouTube Data API channel search (no LLM hallucination)
- [ ] Thumbnails on "Top performing posts" + "Your feed" render on first load (sync persist replaces the broken `after()` flow)
- [ ] After 24h, re-open the same audit — thumbnails STILL render (Storage URLs survive Apify CDN expiry)
- [ ] **Performance chart** (`216973e`): 30-day daily line with interpolated bridge data between posting days. Metric toggle: Views / Engagement / Likes / Comments on one chart. Engagement tab auto-hides when data is zero
- [ ] Missing thumbs render as platform-tinted blocks (TikTok pink / IG magenta / YT red) with the brand mark, not grey eye tiles
- [ ] Wall time per audit: still under 4-5 min despite added sync image persistence (was ~2-3 min)

**Push C — `c86025e` (interactive social disambiguation):**
- [ ] On confirm screen, select competitors → click "Find socials" → see TikTok / IG / YT badges inline per competitor
- [ ] Green pill = auto-selected clear match. Yellow "N options — pick one" = ambiguous → click to choose. "Not found" = no profile.
- [ ] YouTube disambiguation: multiple channels with similar names show as clickable pills with avatar + name + subscriber count
- [ ] Name verification: profiles whose display name doesn't match the brand (< 0.3 Dice coefficient) are rejected (e.g. "2stiq" for "Toastique")
- [ ] Date-range selector: "Past 7 days" / "Past 30 days" toggle on Performance chart
- [ ] **Follow-up**: wire confirmed social selections into the process route so it uses user-confirmed links instead of re-discovering

---

## Deferred — visible UI fixes (paused April 14 in favor of personal-moodboards spec)

Jack noticed these in the live admin shell and asked to come back to them after the personal-moodboards spec lands. Pick up next session.

- [ ] **Competitor spying → Organic social — use brand name in history.** The search history list renames searches to the query text ("Private Lending for Residential…"). Should just show the brand name ("Avondale Private Lending") so the history is scannable. Brand name lives on the client row; swap whatever `display_name` / `query` field the history uses for the client's `name`.
- [ ] **`/admin/clients` — runtime `TypeError: n.filter is not a function`.** Production bundle crash on the clients list (stack caught by `app/admin/error.tsx`). Repro: load `/admin/clients` on cortex.nativz.io. No source maps so line attribution is fuzzy — candidates are the `.filter` / `.some` calls in `components/clients/client-search-grid.tsx` (line 243 `normalizeServices(c.services)` → line 282 `c.services.some(...)`). DB check shows all `services` rows are `text[]` arrays, so the culprit is likely a different array field arriving as non-array from a newer commit. Grep for recent additions that pass dynamic data into `ClientSearchGrid` / its parent.
- [ ] **Users page bento — verify on a real screen.** Shipped in `a844ff3`: centered layout (`max-w-7xl mx-auto`), 1/2/3-column grid, single Team filter (replaces the old Admins + Team split), expanded cards span the full row. Confirm spacing, that long client-access badge runs don't blow out card width, and that 3-up at xl isn't cramped — drop to 2-up if it is.
- [ ] **Edits secondary sidebar — same.** Shipped in `a844ff3`: new rail at `components/layout/admin-edits-sidebar.tsx` mirrors Settings; main rail force-collapses on `/admin/pipeline`, `/admin/shoots`, `/admin/scheduler`. Verify pipeline `?stage=` highlighting and the "Back to dashboard" link reads right.
- [ ] **Personal moodboards spec ready for review.** `tasks/personal-moodboards.md`. Read the "Open questions" section and answer the 5 inline so the SRL has unblocking direction. Then `/srl tasks/personal-moodboards.md`.
- [ ] **Cole's invite retest.** Safari double-redirect bug fix shipped in `d339411`. After Vercel goes green, ask Cole to retry the existing invite link (still valid until 2026-04-21, no need to burn a new token). If he still hits "Safari can't open the page", capture the exact URL and we go deeper.
- [ ] **Migrations 100 + 101 — done April 14.** Marked complete elsewhere in this file; just noting here for continuity.

## Next Session — human QA for April 13 drops

> See **`SRL.md`** at repo root for the full self-referential loop log.

### 🟡 Users-page email composer (shipped April 13, needs human QA)
Code complete across 14 commits (`3fa769e` → `bf93d15`, plus `ac166d2` SRL entry). See `docs/superpowers/specs/2026-04-13-users-page-email-design.md` + `docs/superpowers/plans/2026-04-13-users-page-email.md`.
- [ ] Apply migrations 100 + 101 to the live Supabase project
- [ ] Send a real email to yourself via the /admin/users kebab → Send email → Follow-up day 3 → Send now
- [ ] Schedule one 2 min out; verify it flips to `sent` in the Scheduled emails tab after the cron fires
- [ ] Edit + delete a template via the rail pencil/trash icons
- [ ] Create a new template via "+ New template"
- [ ] Audit `select * from activity_log where action = 'user_email_sent'` — one row per successful send, metadata has template_id + subject + resend_id

### 🟡 Social analyzer redesign (shipped April 13, needs human QA)
Spec at `docs/superpowers/specs/2026-04-13-social-analyzer-redesign-design.md`. 14 feature commits on main. Most flows verified in-session; the remaining human QA is the full end-to-end wall-time test.
- [ ] Start analysis on a new prospect (e.g. jamnola.com). Target wall time ≤150s.
- [ ] Confirm-platforms screen: all 4 platforms pre-filled with full URLs (https + www stripped for display), "Not found" red state when a platform is missing, "Detected" green state after manual paste, "Auto-detected" for scraper hits, brand card with favicon + description + goal checkboxes
- [ ] Competitor card auto-populates with 3 LLM-suggested websites + favicons before the confirm screen renders (no pulsing loading state)
- [ ] Goal checkboxes: start unchecked; Start analysis disabled until ≥1 checked AND ≥1 platform filled
- [ ] Analysis report renders old-style (topline + callouts rolled back to original scorecard grid + Recharts + CompetitorComparisonTable per commit `824743f`)
- [ ] Competitor discovery returns 3–5 candidates for local brands via scope-aware prompt + 3-tier fallback (b00982b, d3088ec)
- [ ] ER chart shows "Engagement data unavailable" placeholder when all values = 0 (Facebook case)

### ✅ Sidebar restructure (shipped April 13)
- [x] Dashboard / Intelligence / Create / Manage — 4-section structure (`7ebfc29`)
- [x] Strategy Lab renamed to Content Lab in all user-visible surfaces (`fc5f8c9`) — 9 files, routes unchanged
- [x] AI Models → AI Settings in sidebar (`200a284`)
- [x] Post scheduler → Calendars (parked as child of Edits) (`b59053a`, `4585f3c`)
- [x] Account menu dropped duplicate API docs + AI models links (`022cf85`)
- [x] Brain replaces Knowledge in Settings submenu
- [x] Portal-side Content Lab added + org-scoping audit patches (Goal 6)

### ✅ Nerd chat — fixed (April 10), verified (April 11)
The two stacked upstream bugs (`list_tasks` schema converter dropping
`type: "object"` and `max_tokens` going to `gpt-5.4-mini` instead of
`max_completion_tokens`) were already resolved by commits `c3743f8` +
the `z.toJSONSchema` swap in `lib/nerd/registry.ts`. `api_error_log`
confirmed the last logged error was 2 min before the fix commit landed
and there have been zero errors since. `scripts/inspect-nerd-errors.ts`
and `scripts/smoke-nerd-tools.ts` committed as ongoing diagnostics.

### ✅ QA — Strategy Lab artifact canvas (April 11 session) — code-verified April 12
- [x] **Open in Strategy Lab from topic search results** — FlaskConical button, client picker dialog, PATCH route all wired
- [x] **Multi-pin persists** — localStorage state, chip bar renders full array, individual removal works. Added bulk "Open in Strategy Lab" button to selection panel (was removed April 10, re-added)
- [x] **Streaming mermaid** — unclosed blocks render "Rendering diagram…" skeleton, no partial code hits renderer
- [x] **Mermaid click-to-zoom** — modal with Copy source, Download SVG, Download PNG (2x canvas). `disableZoom` prevents recursion
- [x] **HTML visual click-to-zoom** — same zoom modal pattern, Copy source only (sandboxed iframe)
- [x] **GFM tables** — header+divider lookahead, dark-theme `<table>` output, inline markdown in cells
- [x] **System prompt teaches artifacts** — 15/15 assertions pass, 6370 chars (under 10k cap)
- [x] **Conversation PDF** — mermaid rasterization via canvas, html-visual rasterization via html2canvas iframe (NEW), per-message PDF captures live SVG

### 🟢 Still open (future session)
- [ ] Validate analytics tool grounding — when user asks "diagnose my
  performance", verify the Nerd reaches for `get_analytics_summary`,
  `compare_client_performance`, `get_top_posts`.
- [ ] First-class artifact persistence table so users can save, tag,
  and share individual artifacts independently of chat messages.
- [ ] Shareable artifact permalinks — public URL per artifact.
- [ ] Dedicated streaming side panel for the primary artifact of a
  message (Claude-web right-panel polish).

### ✅ Research — New features (code-verified April 13)
- [x] **Public share link** — `copyLinkToSearch` in `components/research/history-feed.tsx:565` mints via `/api/search/[id]/share`, gated to `status === 'completed'`, falls back to internal link + "still running" toast on pending rows
- [x] **Bulk share** — `copyAllSelectedLinks:638`, newline-separated public URLs, summary toast counts public vs internal links
- [x] **Selection rework** — right-click wires `ContextMenu` + "Select" menu item → `setSelectionModeActive(true)`; rows become click-to-toggle via `bodyIsSelectable:1014`; bulk panel = Open in Strategy Lab + Copy all + Delete all. Instructional paragraph removed per comment at `:1168`.
- [x] **Brand persistence** — `research-hub.tsx:43-73` persists `selectedClientId` in localStorage (`cortex:research-hub:selected-client-id`); literal `'null'` sentinel survives the "explicit All brands" case; stale client IDs validated against current list
- [x] **Completion toast** — `search-processing.tsx:232` sets `done=true`, fires sonner toast with `action: "View results"`, no auto-redirect. Processing card done state renders its own "View results" button at `:533-551`

### ✅ Cosmetic — Admin Nerd polish + audit icons (code-verified April 13)
- [x] **Audit "Confirm social platforms"** — uses `AuditPlatformIcon` at `components/audit/audit-report.tsx:368`, which renders `TikTokMark`/`InstagramMark`/`FacebookMark`/`YouTubeMark` (no colored dots anywhere on that screen)
- [x] **/admin/nerd parity** — `ChatComposer variant="research"` at `:501`, 16px rounded icon square + `text-2xl` welcoming empty state at `:628-637`, soft client badge pill at `:593-601` (matches Strategy Lab pattern at `strategy-lab-nerd-chat.tsx:665-687`)

### ✅ Audit — Stuck-at-92% fix + finish animation (code-verified April 13)
Code changes shipped — the items below are live-run QA still open (require running dev server + clicks):
- [x] Eased 4-min progress curve replaced the 120s cap — `audit-report.tsx:149-180`, smooth easing via `1 - Math.pow(1 - t, 2.5)`
- [x] 1.5s poll with finish-animation → report handoff — `:185+`
- [ ] QA: stuck audit auto-recovers on refresh (>7min → Failed), or Retry unblocks stale rows
- [ ] QA: fresh audit end-to-end — bar moves smoothly the whole way, ~1s finish animation
- [ ] QA: kill dev mid-audit → reload → auto-fails within ~7min
- [ ] QA: competitor discovery caps at 150s (watch for `competitor discovery exceeded 150s budget` in logs)

### ✅ History rails — Stuck icons (QA-verified April 13)
- [x] Audit rail: in-flight audit icon updates within ~5s of completion
- [x] Research rail: multiple concurrent searches all update, not just the first

### 🟢 Nerd empty-state suggestion pills (only buildable gap found)
- [ ] Add suggestion pill row to `/admin/nerd` empty state to match Strategy Lab's suggestions row (`strategy-lab-nerd-chat.tsx:675-686`) — seeds `setInput(prompt)` on click

### ✅ Claude-style composer rework (shipped April 12)
- [x] Attachment tray above input with chips (research, PDFs, images, files) + ✕
- [x] Paperclip menu: Upload file / Attach research / Attach knowledge entry / Attach moodboard
- [x] Drag-and-drop anywhere on chat pane
- [x] PDF parsing (pdfjs-dist) → indexed as temporary context chunk
- [x] Image support (base64 data URL encoding)
- [ ] Citations linking back to attached doc chips (future)
- [x] Reuse composer component across `/admin/nerd` and Strategy Lab so both get the upgrade at once

### From earlier sessions (still open)
- [ ] Frame extraction debugging — ffmpeg-static works locally but carousel returns 0 frames
- [ ] Video reference library in Strategy Lab Knowledge Base tab
- [ ] QA all 4 Apify scrapers live end-to-end
- [ ] Analytics: client portfolio, social/affiliates/benchmarking tabs, competitor add/refresh/charts, status dots
- [ ] Calendar webhooks: test with real Google Chat URL, verify firing on feedback events
- [ ] Research: suggest topics ontology, history rail client filter with load-more, PDF export matches results page, share links domain-aware

---

## Completed — April 12 Session (Composer rework + Artifact persistence)

### Claude-style composer rework
- [x] **ChatComposer** shared component — wraps PromptInput, used by both `/admin/nerd` and Strategy Lab
- [x] **Attachment tray** above input with typed chips (file/research/knowledge/moodboard) + dismiss
- [x] **Paperclip menu** — Upload file, Attach research, Attach knowledge entry, Attach moodboard
- [x] **Drag-and-drop** — file drops anywhere on chat pane with visual overlay
- [x] **PDF text extraction** — pdfjs-dist in-browser, sent as context to Nerd API
- [x] **Image support** — base64 data URL encoding via FileReader
- [x] **Nerd API `attachments` field** — Zod schema + context injection into system prompt

### Artifact persistence
- [x] **Migration 097** — `nerd_artifacts` table with RLS (admin full, portal read)
- [x] **CRUD API** — POST/GET /api/nerd/artifacts, GET/DELETE /api/nerd/artifacts/[id]
- [x] **Auto-detect type** — detectArtifactType heuristics (script/plan/diagram/ideas/hook/strategy)
- [x] **Save button** — Bookmark icon on every assistant message, auto-detected type + title
- [x] **Artifacts tab** — fourth tab in Strategy Lab workspace (Chat | Knowledge Base | Artifacts | Analytics)
- [x] **Gallery panel** — card list with type badges, detail view with rendered markdown
- [x] **Branded PDF export** — react-pdf document with Nativz/AC branding, client logo, type badge

### Other
- [x] **Bulk "Open in Strategy Lab"** button re-added to research selection panel
- [x] **Html-visual PDF rasterization** — sandboxed iframe + html2canvas for conversation PDF
- [x] **Analytics tool grounding** — verified: get_analytics_summary, get_top_posts, compare_client_performance all registered
- [x] **/srl skill** — autonomous iterative development loop with Ralph loop's best ideas

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

### Full-PDF mermaid + starter pack + docs (SRL iter 4)
- [x] `lib/strategy-lab/rasterize-mermaid.ts` — pre-export helper that renders every ```mermaid body via the live mermaid module in an off-screen DOM container, rasterizes the SVG to a PNG data URL via canvas (light-theme, white background fill), and returns a `Map<hash, dataUrl>` keyed by a stable djb2 content hash
- [x] `components/strategy-lab/pdf-markdown.tsx` — `renderMarkdownToPdfBlocks` now accepts the rasterized map, emits a react-pdf `<Image>` for mermaid blocks whose hashed body matches, falls back to labeled-source for misses
- [x] `components/strategy-lab/strategy-lab-conversation-export-button.tsx` — rasterizes mermaid in parallel with PDF renderer import, passes the map into `StrategyLabConversationPdf`
- [x] `components/strategy-lab/strategy-lab-nerd-chat.tsx` — added a **Full starter pack** quick-start pill (strategy map + 3 scripts + quadrant + cadence table in one composite prompt)
- [x] Exported `STRATEGY_LAB_ADDENDUM` + added `scripts/smoke-strategy-lab-addendum.ts` — 15 assertions that pin the load-bearing keywords/sections and a 10k-char budget guard (currently 6370 chars)
- [x] `docs/strategy-lab-artifacts.md` — full architecture doc covering entry points, state plumbing, rendering pipeline, PDF export, system prompt, quick-starts, diagnostic scripts, and future work

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
