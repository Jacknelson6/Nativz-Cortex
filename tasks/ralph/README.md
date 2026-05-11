# Ralph Loop, 26 PRDs

A Ralph loop iterates: read PRD, read progress, do ONE task, update progress, loop. This folder holds 26 PRDs structured for that loop.

## Folder layout

```
tasks/ralph/
  README.md             ← this file (loop contract)
  CONTEXT.md            ← shared codebase ground truth, read every iteration
  TEMPLATE.md           ← PRD + progress.txt template (for new PRDs)
  <slug>/
    PRD.md              ← spec: schema, contracts, prompts, components, decisions
    progress.txt        ← atomic ordered task list, one task per iteration
```

26 slugs:
- VFF (Viral Format Finder): `vff-01-scaffolding` … `vff-10-content-lab-integration`
- SPY (Prospect Pipeline): `spy-01-prospect-scaffolding` … `spy-10-stickiness-layer`
- ZNA (Zernio Analytics): `zna-01-daily-snapshots` … `zna-06-engagement-trajectory`

See `MEGA_INDEX.md` for cross-series wiring + build phase order.

## Loop contract

**Every iteration MUST:**

1. Read `tasks/ralph/CONTEXT.md` (codebase ground truth, RLS, paths, conventions).
2. Read `tasks/ralph/<slug>/PRD.md` (architecture decisions, schema, prompts).
3. Read `tasks/ralph/<slug>/progress.txt` (find first task with `[ ]`).
4. Execute that ONE task. Only that task.
5. Run task-level verify gate (typecheck, lint, test if specified).
6. Update `progress.txt`: change `[ ]` to `[x]` for the task and append inline notes (commit SHA, deviations, follow-ups).
7. Commit with message `<slug>: T<NN> <task title>` and push to main (per `feedback_push_main_only.md`).
8. Exit. The loop driver invokes the next iteration.

**Never:**
- Skip ahead. Tasks are ordered for a reason (dependencies in DDL, types, components).
- Do two tasks in one iteration, even if "obvious."
- Edit the PRD mid-loop. If the PRD is wrong, mark the current task `[!]` with a note, stop, and surface to Jack.
- Rewrite history. Add followups as new tasks at the bottom of `progress.txt`, never delete completed ones.

## Task format inside progress.txt

```
[ ] T01: <imperative title>
    Files: <comma-separated paths to create or modify>
    Acceptance: <single sentence binary pass/fail>
    Verify: <commands to run, e.g. `npx tsc --noEmit && npm run lint`>
    Notes:
```

State markers:
- `[ ]` pending
- `[x]` complete (append SHA + date)
- `[~]` in progress (only one at a time; if seen at iteration start, resume it)
- `[!]` blocked (PRD wrong, missing dep, scope shift; explain in Notes; stop loop)

## Atomicity rule

A task is "atomic" if a single Ralph iteration can:
- Edit at most ~3 files (rare exceptions: large migrations).
- Pass typecheck and lint at the end of the iteration.
- Be reverted by `git revert <sha>` without breaking the chain (because we don't rely on later commits to compile this one).

If a task fails atomicity, split it. Example: "Wire detail view modal" is too big; split into "Add modal route stub," "Wire metrics panel," "Wire actions row."

## Verify gates

Per-task:
- DB tasks → migration applies cleanly (`supabase db reset --linked` in a branch DB if available, else manual review).
- TS tasks → `npx tsc --noEmit` clean.
- Lint → `npm run lint` clean.
- Component tasks → visual QA noted in progress.txt; Playwright if route exists.
- API tasks → request schema validates, 401/400 paths return proper shape.

Per-PRD (last task is always a verify gate):
- All tasks `[x]`.
- Smoke test described in `Done When` section of PRD passes.

## Build phase order (across PRDs)

See `MEGA_INDEX.md`. Suggested order phases A→F. Inside a phase, PRDs are independent and can be looped in parallel sessions.

## Push notifications

Long-running Ralph sessions should `PushNotification` on:
- PRD complete (all tasks `[x]`).
- Task blocked (`[!]`) requiring Jack input.
- Drift detected (PRD says X, codebase has Y; stop, don't guess).

## House rules (carried from CLAUDE.md)

- No em dash, no en dash, anywhere. Use commas/periods/colons/parens/`-`.
- Sentence case in product UI. Sidebar nav is Title Case.
- Portal API routes MUST scope by `organization_id` via `getPortalClient()` or explicit filter.
- Admin uses `createAdminClient()`; portal prefers `createServerSupabaseClient()` for RLS.
- AI fields null-safe (`?? []`, `?? ''`, `?? 0`).
- Next.js 15: `params: Promise<{ id: string }>` then `await params`.
- Charts: `'use client'`.
- Push to main, no feature branches.
