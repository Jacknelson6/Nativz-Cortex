---
name: srl
description: "Self-Referential Loop — autonomous iterative development loop that builds features without human input. Use when the user says /srl, 'start an SRL', 'make this an SRL', 'self-referential loop', 'SRL loop', 'keep looping', 'loop on this', or wants autonomous iterative development. Also trigger when the user is about to go AFK and wants work to continue."
---

# SRL — Self-Referential Loop

Autonomous, goal-driven development loop. Each iteration reads its own history
from files, picks the next task, builds it, commits, and re-enters. The user
can walk away — the loop runs until the goal is met.

## What makes this different from Ralph

Ralph repeats the same prompt and relies on file-state diff. SRL is smarter:

- **Goal-aware** — knows what "done" looks like, tracks progress per iteration
- **Regression-checking** — each iteration verifies prior work still compiles
- **Self-documenting** — SRL.md IS the loop's memory, readable by future sessions
- **Task-queued** — uses TaskCreate for visibility, not just file diffs
- **Self-pacing** — uses ScheduleWakeup to re-enter at the right interval

But it steals Ralph's best ideas:

- **Stable re-entry prompt** — every wake-up reads state from files, not from
  conversation history (survives context compression)
- **Completion promise** — hard stop when goal is met, no infinite polish loops
- **No human in the loop** — makes design decisions, documents them, moves on

## How to run

### On invocation, do these steps in order:

### 1. Read state from files

```
Read SRL.md     → goal + iteration history (create if missing)
Read todo.md    → full task landscape
git log -5      → recent commits
git status      → any uncommitted work
```

### 2. Set the goal (first invocation only)

If SRL.md has no `## Goal` section, or the user gave a new goal, write one:

```markdown
## Goal (set YYYY-MM-DD)

[What the user asked for — concrete end-state]

### Acceptance criteria
- [ ] Criterion 1 (testable)
- [ ] Criterion 2 (testable)
- ...

### Scope boundaries
- IN: ...
- OUT: ...
```

The acceptance criteria are load-bearing — the loop terminates when all are
checked. Make them specific enough to verify from code.

### 3. Plan this iteration (3-5 tasks)

Assess what's shipped vs. what's left. Create TaskCreate items for this
iteration. Each task must be:

- **Self-contained** — buildable without asking the user anything
- **Verifiable** — tsc, lint, smoke test, or dev server compile
- **Commitable** — ships a coherent unit

Prefer depth over breadth. One fully wired feature beats three half-built ones.

### 4. Execute the tasks

For each task:
1. `TaskUpdate → in_progress`
2. Build the feature
3. Verify: `npx tsc --noEmit` (always), plus relevant tests
4. If verification fails → fix before moving on, never skip
5. Commit with descriptive message
6. `TaskUpdate → completed`
7. `git push`

Use subagents (Agent tool) for independent subtasks when it speeds things up.

### 5. Log the iteration in SRL.md

Append under `## Iterations`:

```markdown
### Iteration N — YYYY-MM-DD

**Shipped:**
- `feat: description` (abc1234)

**State vs goal:**
| Criterion | Status |
|-----------|--------|
| ... | done / partial / not started |

**Gaps or regressions:**
- (anything that broke or needs attention)

**Next iteration:**
- (what to tackle next)
```

### 6. Re-enter or terminate

**Re-enter** via ScheduleWakeup if the goal has unmet criteria:

```
ScheduleWakeup({
  delaySeconds: 90,
  reason: "SRL iteration N+1 — [what's next]",
  prompt: "SRL iteration — continue the self-referential loop. Read SRL.md and todo.md to understand the current goal and progress. Pick the next highest-impact task, build it, commit, push, and log the iteration. Re-enter via ScheduleWakeup if the goal is unmet."
})
```

Use 90s delay (inside cache window) for active building. Use 270s if a long
build/test just kicked off.

**Terminate** if:
- All acceptance criteria are met → check them off in SRL.md, update todo.md
- A blocker requires human input → document it clearly in SRL.md
- 20+ iterations without meaningful progress → something is wrong, stop

On successful termination, write in SRL.md:
```
**SRL complete.** All acceptance criteria met as of iteration N.
```

## Gotchas

- **Don't loop on polish.** If the core feature works and passes typecheck,
  ship it. Don't spend 5 iterations on animation timing.
- **Don't ask the user.** The whole point is autonomy. If a design decision is
  ambiguous, pick the simpler option and document why in the iteration log.
- **Commit every iteration.** Uncommitted work across iterations = risk.
  Even if the iteration only ships one small thing, commit it.
- **Read SRL.md FIRST on re-entry.** The conversation context may be compressed.
  SRL.md is the canonical state. Trust it over your memory.
- **Don't reorganize todo.md.** SRL reads it for context and may add/check items,
  but the user owns the structure. Don't move sections around.
- **Push to main.** This project uses direct-to-main workflow (no feature branches).
- **Port 3001.** Dev server runs on 3001, not 3000.
- **Plans are always approved.** Don't ask for permission — just build.

## Reference files

- `references/re-entry-prompt.md` — the exact prompt used for ScheduleWakeup
  re-entry. Read this when scheduling the next iteration.
- `references/iteration-template.md` — copy-paste template for SRL.md iteration
  entries. Read this when logging an iteration.
