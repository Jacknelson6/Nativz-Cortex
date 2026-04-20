# Session pass-off — 2026-04-18 → 2026-04-19

> Goal: a fresh Claude Code session can read this in 2 minutes and pick up without asking Jack anything.

## TL;DR

Two-night marathon shipped the accounting module, Zernio analytics rebuild, competitor UX unification, Linear project tracking, and a pile of QA polish. All work pushed to `main`; migrations 116–119 applied to prod Supabase. **14 Linear issues** seeded under the Cortex project (NAT-5 → NAT-18) — that's the new source of truth for what to build next.

## What's live on main

Commits from this stretch (newest first):

| Commit | What |
| --- | --- |
| [`ed75e9d`](https://github.com/Jacknelson6/Nativz-Cortex/commit/ed75e9d) | Reporting rebuilt around real Zernio endpoints + per-metric sparkline cards (Jack's linter edit) |
| [`3b0e1ee`](https://github.com/Jacknelson6/Nativz-Cortex/commit/3b0e1ee) | Blogging is flat-amount only; editing stays per-unit |
| [`26b2175`](https://github.com/Jacknelson6/Nativz-Cortex/commit/26b2175) | Service-aware fields + `selectPayrollTeamMembers` dedupe helper |
| [`fa9aa75`](https://github.com/Jacknelson6/Nativz-Cortex/commit/fa9aa75) | 2×2 quad bento on Overview |
| [`6d1fbf4`](https://github.com/Jacknelson6/Nativz-Cortex/commit/6d1fbf4) | Tokened self-submit for team payroll (`/submit-payroll/[token]`) |
| [`2bb7b12`](https://github.com/Jacknelson6/Nativz-Cortex/commit/2bb7b12) | LLM-powered "paste → parse → confirm" import |
| [`8b272ee`](https://github.com/Jacknelson6/Nativz-Cortex/commit/8b272ee) | Employee drill-in drawer (right slide-out) |
| [`bd92102`](https://github.com/Jacknelson6/Nativz-Cortex/commit/bd92102) | Text sizes bumped; Overrides + Misc tabs removed |
| [`997bc50`](https://github.com/Jacknelson6/Nativz-Cortex/commit/997bc50) | Service tabs + `/admin/accounting/year` YTD matrix |
| [`d90ae76`](https://github.com/Jacknelson6/Nativz-Cortex/commit/d90ae76) | Portal Settings row removed; Client View picker modal |
| [`bb71be7`](https://github.com/Jacknelson6/Nativz-Cortex/commit/bb71be7) | Per-user customizable sidebar (hide nav items) |
| [`cdb0072`](https://github.com/Jacknelson6/Nativz-Cortex/commit/cdb0072) | Overnight build — accounting foundation, competitor unification, Zernio expansion |

Full decision log + original overnight spec: [`docs/overnight-build-2026-04-18.md`](overnight-build-2026-04-18.md). Iteration diary: [`SRL.md`](../SRL.md) (Goal 8).

## Linear (project tracking)

- **Org:** Nativz, URL key `nativz`
- **Team:** `NAT`
- **Project:** `Cortex` (id `deec1aee-eb47-4790-80c1-f62862644ef6`)
- **Assignee for everything seeded:** Jack (`d46510ca-f3f2-4eac-a140-b3bec49cb880`)
- **Linear MCP:** installed at user scope + authenticated (healthy `✓`). Next session gets native Linear tools (`create_issue`, `update_issue`, `search_issues`, etc.) without the raw API key.
- **Fallback:** `LINEAR_API_KEY` is in `.env.local` if we ever build a Cortex-side Linear integration.

### Open issues (NAT-5 → NAT-18)

**Epics — Todo, priority-ordered:**

| ID | Priority | Title |
| --- | --- | --- |
| [NAT-5](https://linear.app/nativz/issue/NAT-5) | High | Consolidate admin tools under a single sidebar item |
| [NAT-6](https://linear.app/nativz/issue/NAT-6) | High | Redesign admin Strategy Lab to match the portal layout |
| [NAT-7](https://linear.app/nativz/issue/NAT-7) | High | Competitor Spying polish + full API coverage + ecom competitor |
| [NAT-10](https://linear.app/nativz/issue/NAT-10) | High | Editing Pipeline: end-to-end fix |
| [NAT-8](https://linear.app/nativz/issue/NAT-8) | Medium | Benchmarking into Analytics as a first-class tab (depends on NAT-7) |
| [NAT-9](https://linear.app/nativz/issue/NAT-9) | Medium | Analytics dashboard redesign |

**QA tickets — Todo:** [NAT-11](https://linear.app/nativz/issue/NAT-11) Accounting E2E · [NAT-12](https://linear.app/nativz/issue/NAT-12) Competitor resolve · [NAT-13](https://linear.app/nativz/issue/NAT-13) Analytics render · [NAT-14](https://linear.app/nativz/issue/NAT-14) Portal sidebar + Client View picker · [NAT-15](https://linear.app/nativz/issue/NAT-15) Sidebar preferences

**Deferred — Backlog:** [NAT-16](https://linear.app/nativz/issue/NAT-16) top-performer cron · [NAT-17](https://linear.app/nativz/issue/NAT-17) consolidate `client_competitors` + `client_benchmarks` · [NAT-18](https://linear.app/nativz/issue/NAT-18) Next 16 `proxy.ts` migration

### Suggested pick-up order

1. **Burn through QA (NAT-11 → NAT-15)** — fast wins, gets the recently shipped work verified
2. **NAT-5 Admin Tools consolidation** — foundational; Accounting + Users + Production Updates already exist, this just unifies the sidebar surface
3. **NAT-10 Editing Pipeline fix** — unblocks the downstream payroll flow (pipeline completion → editor payroll entry)
4. **NAT-7 Competitor Spying** — prerequisite for NAT-8 Benchmarking

## Active product decisions (don't re-litigate)

- **Accounting services:** Only **Editing** uses per-unit pricing (Videos × Rate → Amount auto-computed, read-only). **SMM / Affiliate / Blogging** are flat Amount only. "Overrides" and "Misc" are schema-allowed but hidden from UI.
- **Benchmarks location:** Stays on `/admin/analytics` Benchmarking tab. Competitor Spying links into it, doesn't host it.
- **Competitor flow:** Unified input on the Benchmarking tab accepts a social URL *or* a website domain. Domain path crawls the site for socials, user picks.
- **Notifications:** All automatic performance detectors default **off** (`lib/types/notification-preferences.ts`). Detection plumbing exists but idle. Opt-in from Settings → Notifications.
- **Team member dedupe:** `lib/accounting/team-directory.ts → selectPayrollTeamMembers()` dedupes stale Supabase rows by normalized full_name. DB still has duplicates (3× Cole, 2× Trevor, 1× "test") — filter keeps payroll UI sane without a cleanup migration.
- **Portal nav:** Settings row is gone; reach it via the avatar popover. Client View opens a searchable client picker modal that hits `/api/impersonate`.
- **Sidebar prefs:** Per-user `hidden_sidebar_items` (migration 118). Dashboard + Settings are unhidable. Uses stable `navKey` (admin href) so prefs survive admin→portal href remaps.

## Schema state

Migrations applied to prod Supabase during this session (via MCP):

- **116** `payroll_periods` + `payroll_entries` (admin-only RLS)
- **117** `platform_follower_daily` (dual-source: `zernio` vs `snapshot-rollup`)
- **118** `users.hidden_sidebar_items text[]`
- **119** `payroll_submission_tokens` (per-period, per-team-member, 21-day TTL)

All four are present on prod. Local migration files exist under `supabase/migrations/`.

## Gotchas worth knowing

- **Zernio audience endpoints 404 on most plans** — UI auto-hides the audience insights card when Zernio returns null. Don't treat 404s as errors.
- **Tokened submit page** — routes at `/submit-payroll/[token]` + `/api/submit-payroll/[token]/*` are public (middleware allowlist). Security model: server looks up `team_member_id` + `period_id` from the token; submitter can't override via payload. Margin is always 0 on submissions.
- **Accounting CSV export** uses dollar-formatted strings (not cents) — matches the bookkeeping paste-into-spreadsheet workflow.
- **`.next/types/` can go stale** and break `tsc`. If you hit `File '...page.ts' not found` errors, `rm -rf .next/types` and re-run.
- **OpenCassava + hyperframes-explainer** are excluded from `tsconfig.json` — they're separate sub-projects that throw errors otherwise.
- **Team directory**: if Jack adds a new team member and doesn't see them in accounting, check for name collisions against the dedupe rules (normalized lowercase + trimmed). The row with a `user_id` or the latest `created_at` wins.

## Morning QA checklist (duplicate of NAT-11 → NAT-15)

- [ ] `/admin/accounting` → create period → add entries across all 4 services → drill-in drawer opens → CSV export downloads
- [ ] Import flow: paste unstructured text → parse preview → confirm → rows land
- [ ] Submit-payroll: mint a token for yourself → open incognito → paste → submit → entries appear in admin
- [ ] `/admin/analytics` with Zernio-connected client → top performers panel renders with real thumbnails; platform icons present; audience insights renders or silently hides
- [ ] `/admin/analyze-social/<attached-audit-id>` → Competitors section shows "View in benchmarks" cross-link → deep-links to `/admin/analytics?tab=benchmarking`
- [ ] Portal: Settings nav row gone; avatar popover → Client View opens picker → pick a client → lands on their portal with impersonation banner
- [ ] Settings → Sidebar → toggle an item → refresh → item is gone; Dashboard + Settings can't be hidden

## Open threads / questions

- **Team member cleanup:** Jack could wipe the duplicate rows for good — happy to run `DELETE` via Supabase MCP if confirmed which IDs to drop. Current filter handles them live.
- **NAT-5 design:** the "one admin sidebar item" pattern needs a quick wireframe call before building — is it a secondary rail like Settings today, or a dashboard landing page?
- **NAT-6 Strategy Lab audit:** need to actually enumerate divergences between admin and portal versions. Run `components/strategy-lab/strategy-lab-nerd-chat.tsx` vs its portal equivalent first thing.
- **Linter edit** on `components/reporting/platform-section.tsx` + `lib/posting/zernio.ts` + `lib/reporting/sync.ts` during this session — looks intentional (metric sparkline overhaul) and is committed as `ed75e9d`. If behavior seems different from the commit messages above, check that commit first.

## How to continue

1. Read this doc. Then [`docs/overnight-build-2026-04-18.md`](overnight-build-2026-04-18.md) for the original scope and design decisions.
2. Run `claude mcp list | grep linear` — should show `✓ Connected`. Linear tools are available.
3. Run `git log --oneline -20` to see if anything's landed after this doc was written.
4. Pick an issue from NAT-11 → NAT-18 (QA/deferred) for a fast win, or NAT-5/NAT-10 for the next substantial feature.
5. Push directly to `main` — this repo doesn't use feature branches. All automated migrations go through the Supabase MCP.
