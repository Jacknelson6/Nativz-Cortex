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
- [~] Global shell: bottom tab bar + drawer + top bar collapse (starting now)

## Per-surface checklist

### Foundation (must finish before priorities 2-5)
- [ ] `components/layout/admin-sidebar.tsx` — hide at `max-lg:`, render as drawer
- [ ] `components/layout/mobile-bottom-nav.tsx` (new) — 5-tab bottom nav
- [ ] `components/layout/admin-top-bar.tsx` — mobile compact form
- [ ] `components/layout/admin-brand-pill.tsx` — mobile compact trigger
- [ ] `app/(app)/layout.tsx` — wire mobile chrome
- [ ] Safe-area insets, iOS keyboard, viewport meta

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
