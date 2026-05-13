# Mobile adaptation — page index

One PRD per main UI page. Each line: route → one-line purpose → PRD link.

Read [`README.md`](./README.md) first for global rules.

## Brand-scoped (`(app)` shell)

These pages follow the active brand pill. Same route serves admin and viewer.

| Route | Purpose | PRD |
|------|---------|-----|
| `/finder/new` + topic detail tree | AI topic research — search to find trending topics | [`brand/trend-finder.md`](./prds/brand/trend-finder.md) |
| `/finder/formats` | Netflix-style explore page of viral short-form formats | [`brand/viral-formats.md`](./prds/brand/viral-formats.md) |
| `/lab` | Strategy Lab — chat with brand-aware AI | [`brand/strategy-lab.md`](./prds/brand/strategy-lab.md) |
| `/calendar` + `/[id]` + `/review` | Content calendar — drops, scheduling, captioning | [`brand/calendar.md`](./prds/brand/calendar.md) |
| `/review` | Brand-scoped content review queue | [`brand/review.md`](./prds/brand/review.md) |
| `/spying` + audits + self-audit + versus + watch | Competitor spying suite | [`brand/spying.md`](./prds/brand/spying.md) |
| `/brand-profile` | Brand DNA + voice + audience profile | [`brand/brand-profile.md`](./prds/brand/brand-profile.md) |
| `/notes` + `/[id]` | Brand notes / scratch pad | [`brand/notes.md`](./prds/brand/notes.md) |
| `/ads` + `/batches/[batchId]` | Ad Generator (Kandy/static ads) | [`brand/ad-generator.md`](./prds/brand/ad-generator.md) |
| `/deliverables` | Monthly production scope / package usage | [`brand/deliverables.md`](./prds/brand/deliverables.md) |

## Admin

Operational and platform-admin surfaces. Admin role only.

| Route | Purpose | PRD |
|------|---------|-----|
| `/admin/dashboard` | Agency-wide KPIs and at-a-glance pipeline state | [`admin/dashboard.md`](./prds/admin/dashboard.md) |
| `/admin/analytics` + sub-tabs | Cross-brand analytics (overview/social/benchmarking/affiliates/zernio) | [`admin/analytics.md`](./prds/admin/analytics.md) |
| `/admin/clients` + sub-pages | Client roster + per-client workspace + 10-tab settings | [`admin/clients.md`](./prds/admin/clients.md) |
| `/admin/content-tools` | Cross-brand content command surface (6 tabs) | [`admin/content-tools.md`](./prds/admin/content-tools.md) |
| `/admin/onboarding` + `/[id]` | Unified onboarding tracker (SMM + editing) | [`admin/onboarding.md`](./prds/admin/onboarding.md) |
| `/admin/ops/publish-health` | Publish-pipeline health dashboard | [`admin/publish-health.md`](./prds/admin/publish-health.md) |
| `/admin/users` | Platform user management | [`admin/users.md`](./prds/admin/users.md) |
| `/admin/team` | Internal team-member roster | [`admin/team.md`](./prds/admin/team.md) |
| `/admin/tools` | Internal one-off tools | [`admin/tools.md`](./prds/admin/tools.md) |
| `/admin/pipeline` | Operations pipeline view | [`admin/pipeline.md`](./prds/admin/pipeline.md) |
| `/admin/scheduler` | Cross-brand schedule overview | [`admin/scheduler.md`](./prds/admin/scheduler.md) |
| `/admin/share-links` | Share-link oversight | [`admin/share-links.md`](./prds/admin/share-links.md) |
| `/admin/settings` + sub-tabs | Cortex platform settings (AI / production updates / usage) | [`admin/settings.md`](./prds/admin/settings.md) |
| `/admin/accounting` + invoice + editor | Internal accounting (super-admin) | [`admin/accounting.md`](./prds/admin/accounting.md) |
| `/admin/usage` | Cortex usage and billing metrics | [`admin/usage.md`](./prds/admin/usage.md) |
| `/admin/nerd` + settings | API docs + skills + guardrails | [`admin/nerd.md`](./prds/admin/nerd.md) |
| `/admin/formats` + sub-pages | Cross-brand viral-formats library + taxonomy | [`admin/formats.md`](./prds/admin/formats.md) |
| `/admin/ideas` + generate + detail | Idea bank + generator | [`admin/ideas.md`](./prds/admin/ideas.md) |
| `/admin/moodboard/[id]` | Moodboard detail | [`admin/moodboard.md`](./prds/admin/moodboard.md) |
| `/admin/presentations` + sub | Presentations builder | [`admin/presentations.md`](./prds/admin/presentations.md) |
| `/admin/prospects/*` | Prospects / digests / alerts | [`admin/prospects.md`](./prds/admin/prospects.md) |
| `/admin/infrastructure` | Infra page | [`admin/infrastructure.md`](./prds/admin/infrastructure.md) |
| `/admin/account` | Admin's own account | [`admin/account.md`](./prds/admin/account.md) |

## Portal + public

| Route | Purpose | PRD |
|------|---------|-----|
| `/portal/analytics` + `/portal/research/formats[+detail]` | Viewer-only portal carve-outs | [`portal-public/portal.md`](./prds/portal-public/portal.md) |
| `/c/[token]` + `/c/[token]/download` | Calendar share link (client review surface) | [`portal-public/calendar-share.md`](./prds/portal-public/calendar-share.md) |
| `/c/edit/[token]` + `/c/edit/[token]/download` | Editing project share link | [`portal-public/editing-share.md`](./prds/portal-public/editing-share.md) |
| `/s/[token]`, `/p/digest-unsubscribe/[token]`, other one-shot tokens | One-shot acceptance & utility pages | [`portal-public/single-action-tokens.md`](./prds/portal-public/single-action-tokens.md) |
| `/shared/*` | Legacy share namespaces | [`portal-public/legacy-share.md`](./prds/portal-public/legacy-share.md) |
| `/present/[token]` + `/admin/presentations/[id]/present` | Public present-mode (out-of-scope for phone) | [`portal-public/present-mode.md`](./prds/portal-public/present-mode.md) |
| `/comptroller/[token]`, `/submit-payroll/[token]`, `/connect/*` | Operational one-shot tokens | [`portal-public/ops-tokens.md`](./prds/portal-public/ops-tokens.md) |

## Auth & first-run

| Route | Purpose | PRD |
|------|---------|-----|
| `/`, `/login`, `/admin/login`, `/forgot-password`, `/reset-password` | Auth pages | [`auth/auth.md`](./prds/auth/auth.md) |
| `/join/[token]`, `/onboarding/[token]` | Public onboarding / accept invite | [`auth/onboarding.md`](./prds/auth/onboarding.md) |

---

## Pages explicitly excluded from PRDs

These exist in the codebase but are flagged as legacy duplicates and should be deleted in a separate cleanup pass, not adapted to mobile:

- `/admin/calendar` and all its sub-pages (`/[id]`, `/library`, `/review`) — superseded by brand-root `/calendar`
- `/admin/ad-creatives-v2[/*]` — superseded by `/ads`
- `/admin/analyze-social[/*]` — superseded by `/spying`
- `/admin/competitor-tracking/{ecom, meta-ads, social-ads}` — superseded by `/spying/versus`

Flag these for [audit](../../docs/) and removal rather than adapting them.
