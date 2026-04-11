# SRL — Self-Referential Loop

> **Not a Ralph loop.** Session-level dev loop that uses the TaskCreate queue.
> When the queue is empty, the final standing task is **always** "regenerate
> the todo list" — so the loop never terminates until the goal is hit.

## Goal (owner: user, set 2026-04-11)

In Strategy Lab, a user can:
1. Open from a topic search result page (or directly)
2. See their topic searches attached as chips + add more
3. Chat with the Nerd using those searches as grounded context
4. Ask for script ideas, video ideas, performance analysis, improvement plans
5. Receive **artifacts** (markdown, mermaid diagrams, scripts, plans) rendered
   inline like Claude web — side panel, download as PDF, copy button
6. Iterate: update artifacts in place, keep refining

## Iterations

### Iteration 1 — 2026-04-11

**Nerd chat diagnosis → already fixed in committed code.**
Both logged errors (`list_tasks` schema + `max_tokens` on gpt-5.4-mini) were
already resolved by commits `c3743f8` + registry swap to `z.toJSONSchema`.
Last logged error was 21:12 UTC, 2 min before the fix landed. Zero errors
since. Smoke test passes for all 48 tools.

**Focus:** Build artifact system (the actual feature). See TaskList.

### Iteration 2 — (regenerated at end of iteration 1)

_To be written._
