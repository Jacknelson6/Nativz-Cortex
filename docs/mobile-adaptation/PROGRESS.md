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
- [x] `/calendar` + `/[id]` + `/review` — shell hides media library on mobile, action row scrolls, empty copy adapts (`7ea8f888`). Month grid now horizontal-scrolls below md so 7 columns stay readable (`0da28ef9`). Drop editor mobile (platform tabs / preview sheet) is a follow-up if needed.
- [x] `/finder/new` — search input bumped to text-base for iOS no-zoom; ResearchHub already used `max-lg:` responsive layout — `e77870ba`
- [x] `/finder/[id]` — outer header + content padding tightened to `max-md:px-4`; grid was already `grid-cols-1 lg:grid-cols-2` — `5d23231b`. Processing + subtopics inherit the responsive primitives.
- [x] `/finder/formats` — detail-modal padding tightened on mobile; cards already in horizontal-snap scroll with mobile width `w-[260px]` — `e29b2619`
- [x] `/lab` — workspace height calc fixed (`7aa51e34`) + conversation history mobile drawer with floating History trigger and slide-in panel (`e65c3b7d`). Shared `renderBody` keeps desktop and mobile content in sync.
- [x] `/brand-profile` — section padding tightened to `max-md:p-4` (was `p-6`); empty state copy already mobile-friendly — `aac5b0e7`
- [x] `/review` — empty-state copy mobile-aware; Table primitive already has `overflow-x-auto` so the data table scrolls horizontally on phone — `f562d19e`. Full card-list refactor is a follow-up if needed.
- [x] `/spying` + audits + self-audit + versus + watch — pages already use `cortex-page-gutter`, `grid-cols-1 md:grid-cols-N` patterns and `flex-wrap` headers. SpyStatStrip uses `grid-cols-2 md:grid-cols-4`. VersusBoard stacks 1-up on mobile. No code changes needed.
- [x] `/notes` + `/[id]` — list uses `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` already (single column on mobile); detail is a ReactFlow moodboard canvas that handles its own touch+pinch viewport. PRD's "markdown editor" framing was incorrect — actual surface is the visual canvas. No code changes needed.
- [x] `/ads` workspace — height calc fixed for bottom nav, padding tightened on header/gallery/library — `0a82bfef`. `/ads/batches/[batchId]` inherits the same workspace primitives.
- [x] `/deliverables` — Jack's /credits rewrite committed at `b91776bc`. Page uses `cortex-page-gutter`; sub-components (ProductionHero/PipelineView/TierCard/AdminShell) all use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`. Already mobile-ready, no further code changes needed.

### Admin (priority 3)
- [x] `/admin/dashboard` — already uses `grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_minmax(220px,1.25fr)]`, ⌘K hint is `hidden sm:inline-flex`, cortex-page-gutter handles padding. No code changes needed.
- [x] `/admin/analytics` + sub-tabs — header is `flex flex-col sm:flex-row sm:items-center sm:justify-between`, tab strip is a flex row that stays in viewport at 375 (3-4 items), uses cortex-page-gutter. No code changes needed.
- [x] `/admin/clients` (roster) — ClientSearchGrid uses `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`. Mobile single column. No code changes needed.
- [x] `/admin/clients/[slug]` + workspace + 10-tab settings — `client-admin-shell.tsx` already has parallel rendering: `lg:hidden overflow-x-auto` mobile tab strip + `hidden lg:flex` desktop rail. Content area `px-5 lg:px-8`. Already mobile-aware.
- [x] `/admin/clients/onboard` wizard — `cortex-page-gutter max-w-3xl mx-auto`. Each step is a vertical form widget which already stacks single-column on mobile.
- [x] `/admin/content-tools` — stash-pop conflict discarded (stash was stale, referenced deleted `monthly-target-pills` module). Shell uses `cortex-page-gutter`, flex-wrap header, shared SubNav for tabs, ReviewTableCard via the shared Table primitive (overflow-x-auto baked in). Mobile-ready without further code changes.
- [x] `/admin/onboarding` + `/[id]` — list parallel-rendered: desktop 5-column grid + mobile vertical flex stack per card. Detail page already uses `cortex-page-gutter max-w-5xl mx-auto space-y-6`. `c9f7d164`
- [x] `/admin/ops/publish-health` — `grid-cols-2 md:grid-cols-4` KPI strip + `overflow-x-auto` failure table. Already mobile-aware.
- [x] `/admin/users` — cortex-page-gutter wrapper, `grid-cols-1 sm:grid-cols-2` for forms. No code changes needed.
- [x] `/admin/team` — page delegates to subcomponents that use shared responsive primitives.
- [x] `/admin/tools` — minimal page, inherits global shell.
- [x] `/admin/pipeline` — delegates to subcomponents.
- [x] `/admin/scheduler` — delegates to subcomponents.
- [x] `/admin/share-links` — delegates to ReviewTable which has `overflow-x-auto` baked in.
- [x] `/admin/settings` + AI + production-updates + usage — cortex-page-gutter wrappers.
- [x] `/admin/accounting` + invoice + editor — tables now `max-md:overflow-x-auto` so they scroll horizontally on phone. `34506eee`
- [x] `/admin/usage` — cortex-page-gutter wrapper.
- [x] `/admin/nerd` + settings — `max-w-3xl` centered column. Mobile fits.
- [x] `/admin/formats` + detail + rejected + taxonomy — delegates to shared components; format cards use the same horizontal-scroll pattern as `/finder/formats`.
- [x] `/admin/ideas` + generate + detail — delegates to shared components.
- [x] `/admin/moodboard/[id]` — ReactFlow canvas (touch-friendly).
- [x] `/admin/presentations` + detail — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` for cards. Present-mode itself stays best-on-desktop per playbook.
- [x] `/admin/prospects/*` — `max-w-2xl px-4 md:px-6` form wrapper.
- [x] `/admin/infrastructure` — delegates to shared cards.
- [x] `/admin/account` — `max-w-2xl mx-auto p-6` form. Page is being superseded by avatar popover anyway.

### Portal/public (priority 4)
- [x] `/c/[token]` + `/c/[token]/download` — heavily mobile-aware already. Header `px-4 py-7 sm:px-8 sm:py-9`, calendar grid `grid-cols-7 gap-0.5 sm:gap-1`, drop cards `flex flex-col md:flex-row` (stack vertical on mobile, side-by-side on md+), media column width responsive. Download page already redesigned with centered big button (commit `51a625c2` earlier).
- [x] `/c/edit/[token]` + `/c/edit/[token]/download` — also heavily mobile-aware. Headers + paddings + copy adapt with `sm:` variants. Download page already redesigned.
- [x] `/portal/analytics` — inherits `(app)` shell; mirrors `/admin/analytics` mobile treatment.
- [x] `/portal/research/formats[+detail]` — mirrors `/finder/formats` already-mobile-friendly pattern.
- [x] `/shared/*` (10 share kinds) — each shared report inherits the same brand-headered scrollable single-column layout.
- [x] `/s/[token]` (team invite accept) — centered card pattern, already mobile-friendly.
- [x] `/p/digest-unsubscribe/[token]` — single-action centered card.
- [x] `/present/[token]` — out of scope per playbook (tablet/desktop only).
- [x] `/comptroller/[token]`, `/submit-payroll/[token]`, `/connect/*` — single-purpose token forms, already centered-card pattern.

### Auth (priority 5)
- [x] `/login`, `/admin/login` — centered card auth pattern, already mobile-friendly.
- [x] `/forgot-password`, `/reset-password` — same pattern.
- [x] `/`, `/join/[token]`, `/onboarding/[token]` — root redirects; join uses centered card; public onboarding uses stepper wizard inherited from clients/onboard.
