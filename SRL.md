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

### Iteration 2 — 2026-04-11 (continued)

**Shipped in iteration 1:**
- `feat(strategy-lab): artifact-first chat — mermaid/html-visual + entry from search` (305c606)
- `fix(strategy-lab): Open in Strategy Lab pins exactly the clicked search` (522808a)

**Regressions or gaps found after iter 1:**
- **Streaming mermaid flashes "syntax error".** Assistant messages stream
  one chunk at a time. MermaidDiagramBlock re-runs its parse effect on
  every code change, so while the block is mid-stream the user sees the
  mermaid fallback (raw code + "could not render") until the closing
  fence arrives. Fix: defer parse while streaming OR buffer fenced blocks
  until the closing ``` is seen.
- **No way to blow up an artifact to full-size.** Inline mermaid
  diagrams are fine in the thread but a Claude-web-style canvas would
  let the user actually read the diagram at presentation scale, then
  download it as PNG or SVG. Fix: click-to-expand modal with raster
  + SVG download.
- **Workspace still single-pin.** `selectedTopicSearchId` is a scalar;
  multi-search grounding relies on the chip bar's local `attachedSearchIds`.
  Pre-pinning multiple searches from the history feed doesn't flow through.
  Fix: hoist multi-pin state into the workspace so a batch-select from the
  history feed lands pinned correctly.
- **No end-to-end smoke run yet.** Dev server not started this session.
  tsc + lint + smoke test all pass but a real chat round-trip is worth
  doing before calling it done.

**Next queue:** see TaskCreate items #14+.
