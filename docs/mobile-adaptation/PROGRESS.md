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
- [ ] `components/layout/admin-sidebar.tsx` — drawer already wired via SidebarProvider; verify drawer height + scroll on mobile
- [ ] `components/layout/admin-brand-pill.tsx` — mobile compact trigger (truncated label, popover height)
- [ ] iOS keyboard: scroll-into-view on active input

### Brand-scoped (priority 2)
- [ ] `/calendar` + `/[id]` + `/review`
- [ ] `/finder/new`
- [ ] `/finder/[id]` + processing + subtopics
- [ ] `/finder/formats`
- [ ] `/lab`
- [ ] `/brand-profile`
- [ ] `/review`
- [ ] `/spying` + audits + self-audit + versus + watch
- [ ] `/notes` + `/[id]`
- [ ] `/ads` + `/batches/[batchId]`
- [ ] `/deliverables`

### Admin (priority 3)
- [ ] `/admin/dashboard`
- [ ] `/admin/analytics` + sub-tabs
- [ ] `/admin/clients` + roster
- [ ] `/admin/clients/[slug]` + workspace + 10-tab settings
- [ ] `/admin/clients/onboard` wizard
- [ ] `/admin/content-tools`
- [ ] `/admin/onboarding` + `/[id]`
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
