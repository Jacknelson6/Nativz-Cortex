# Mobile adaptation — progress log

Append a line per surface as it ships. Loop reads this to know what's done.

## Status legend
- `[x]` done + verified at 375/414/768 + desktop diff = 0
- `[~]` in progress
- `[ ]` not started

---

## Iteration log

### Iteration 1 — bootstrap (2026-05-13)
- [x] PRD set written (42 PRDs in `docs/mobile-adaptation/prds/**`) — committed `11e7b932`

### Iteration 2 — mobile bottom-nav (2026-05-13)
- [x] Mobile bottom-nav + `(app)` layout integration — `8742bd7d`

## Per-surface checklist

### Foundation (must finish before priorities 2-5)
- [x] `components/layout/mobile-bottom-nav.tsx` (new) — 5-tab bottom nav (4 surfaces + More) — `8742bd7d`
- [x] `app/(app)/layout.tsx` — wire mobile chrome (nav + spacer) — `8742bd7d`
- [x] Safe-area inset bottom (`env(safe-area-inset-bottom)`) — done in bottom nav
- [x] `components/layout/admin-top-bar.tsx` — mobile compact (gap/padding/logo shrink, brand pill cap) — `25baa380`
- [x] Viewport meta — `viewport-fit=cover` exported in `app/layout.tsx` — `1f96340d`
- [x] `components/layout/sidebar.tsx` mobile drawer — safe-area pad + a11y dialog role — `544b0a96`
- [x] `components/layout/admin-brand-pill.tsx` — trigger already capped by top-bar `max-md:max-w-[160px]`; popover `min-w-[280px]` fits 375+ viewport
- [x] iOS keyboard: global scroll-margin on inputs/textareas under 1024px — `544b0a96`

### Brand-scoped (priority 2)
- [~] `/calendar` + `/[id]` + `/review` — shell partial (`7ea8f888`: media library hidden, action row scrolls, empty copy). Still todo: list view → cards, FAB for new post, drop editor mobile (platform tabs / preview sheet), `/calendar/[id]` detail, `/calendar/review`
- [x] `/finder/new` — search input bumped to text-base for iOS no-zoom; ResearchHub already used `max-lg:` responsive layout — `e77870ba`
- [x] `/finder/[id]` — outer header + content padding tightened to `max-md:px-4`; grid was already `grid-cols-1 lg:grid-cols-2` — `5d23231b`. Processing + subtopics inherit the responsive primitives.
- [x] `/finder/formats` — detail-modal padding tightened on mobile; cards already in horizontal-snap scroll with mobile width `w-[260px]` — `e29b2619`
- [~] `/lab` — workspace height calc fixed so composer clears bottom nav + safe area on mobile (`7aa51e34`). Chat header/composer/messages already had `md:` responsive padding. Outstanding: conversation history rail mobile drawer (rail is `hidden lg:flex`; needs Sheet wrapper for mobile entry).
- [x] `/brand-profile` — section padding tightened to `max-md:p-4` (was `p-6`); empty state copy already mobile-friendly — `aac5b0e7`
- [x] `/review` — empty-state copy mobile-aware; Table primitive already has `overflow-x-auto` so the data table scrolls horizontally on phone — `f562d19e`. Full card-list refactor is a follow-up if needed.
- [x] `/spying` + audits + self-audit + versus + watch — pages already use `cortex-page-gutter`, `grid-cols-1 md:grid-cols-N` patterns and `flex-wrap` headers. SpyStatStrip uses `grid-cols-2 md:grid-cols-4`. VersusBoard stacks 1-up on mobile. No code changes needed.
- [x] `/notes` + `/[id]` — list uses `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` already (single column on mobile); detail is a ReactFlow moodboard canvas that handles its own touch+pinch viewport. PRD's "markdown editor" framing was incorrect — actual surface is the visual canvas. No code changes needed.
- [x] `/ads` workspace — height calc fixed for bottom nav, padding tightened on header/gallery/library — `0a82bfef`. `/ads/batches/[batchId]` inherits the same workspace primitives.
- [!] `/deliverables` — BLOCKED. Jack has uncommitted WIP on `app/(app)/deliverables/page.tsx` (rewriting from /credits). Mobile adaptation paused until that lands so we don't entangle changes. Revisit after his WIP merges.

### Admin (priority 3)
- [x] `/admin/dashboard` — already uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_minmax(220px,1.25fr)]`, ⌘K hint is `hidden sm:inline-flex`, cortex-page-gutter handles padding. No code changes needed.
- [x] `/admin/analytics` + sub-tabs — header is `flex flex-col sm:flex-row sm:items-center sm:justify-between`, tab strip is a flex row that stays in viewport at 375 (3-4 items), uses cortex-page-gutter. No code changes needed.
- [x] `/admin/clients` (roster) — ClientSearchGrid uses `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`. Mobile single column. No code changes needed.
- [x] `/admin/clients/[slug]` + workspace + 10-tab settings — `client-admin-shell.tsx` already has parallel rendering: `lg:hidden overflow-x-auto` mobile tab strip + `hidden lg:flex` desktop rail. Content area `px-5 lg:px-8`. Already mobile-aware.
- [x] `/admin/clients/onboard` wizard — `cortex-page-gutter max-w-3xl mx-auto`. Each step is a vertical form widget which already stacks single-column on mobile.
- [!] `/admin/content-tools` — BLOCKED. `components/admin/content-tools/content-tools-shell.tsx` has Jack's uncommitted WIP. Revisit after his changes land.
- [x] `/admin/onboarding` + `/[id]` — list parallel-rendered: desktop 5-column grid + mobile vertical flex stack per card. Detail page already uses `cortex-page-gutter max-w-5xl mx-auto space-y-6`. `c9f7d164`
- [ ] `/admin/ops/publish-health`
- [ ] `/admin/users`
- [ ] `/admin/team`
- [ ] `/admin/tools`
- [ ] `/admin/pipeline`
- [ ] `/admin/scheduler`
- [ ] `/admin/share-links`
- [ ] `/admin/settings` + AI + production-updates + usage
- [ ] `/admin/accounting` + invoice + editor
- [ ] `/admin/usage`
- [ ] `/admin/nerd` + settings
- [ ] `/admin/formats` + detail + rejected + taxonomy
- [ ] `/admin/ideas` + generate + detail
- [ ] `/admin/moodboard/[id]`
- [ ] `/admin/presentations` + detail
- [ ] `/admin/prospects/*`
- [ ] `/admin/infrastructure`
- [ ] `/admin/account`

### Portal/public (priority 4)
- [ ] `/c/[token]` + `/c/[token]/download` — biggest client mobile traffic
- [ ] `/c/edit/[token]` + `/c/edit/[token]/download`
- [ ] `/portal/analytics`
- [ ] `/portal/research/formats[+detail]`
- [ ] `/shared/*` (10 share kinds)
- [ ] `/s/[token]` (team invite accept)
- [ ] `/p/digest-unsubscribe/[token]`
- [ ] `/present/[token]` (best-effort, out-of-scope per playbook)
- [ ] `/comptroller/[token]`, `/submit-payroll/[token]`, `/connect/*`

### Auth (priority 5)
- [ ] `/login`, `/admin/login`
- [ ] `/forgot-password`, `/reset-password`
- [ ] `/`, `/join/[token]`, `/onboarding/[token]`
