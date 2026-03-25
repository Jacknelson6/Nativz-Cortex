# PRD: LLM-native topic search pipeline (v3)

## Introduction / overview

**Problem:** The current topic search pipeline (`POST /api/search/[id]/process`) depends heavily on **Brave SERP**, **platform routers** (e.g. Apify TikTok), and **code-first analytics** before LLM narrative. That is expensive, slow, brittle to anti-bot changes, and—per product feedback—**demo-quality structured LLM output can read better than raw scrape output**.

**Solution:** Add a **second pipeline** (feature-flagged) that: (1) **plans 1–5 subtopics** from a user topic via a cheap LLM + user edit, (2) runs **N parallel tool-augmented research agents** (search + fetch URL; optional render later), **merges** into the **existing** `TopicSearch` / `TopicSearchAIResponse` contract, and (3) **persists deduped sources** for the same source-browser UX. **Admin and portal results UIs stay the same**; new work is **backend + subtopic-planning step** in the new-search flow.

**Resolved assumptions (from product discussion):**

- **Topic vs brand** — `summary` = executive summary of the **topic**; `brand_alignment_notes` = bridge **topic → client brand** when `client_strategy` + client context (same pattern as Goldback seed work).
- **Tools** — Sub-agents get **real search + fetch** (Brave Search API first-class); **no parametric-only** claims without tool evidence in v1.
- **Models** — Small planner; **mid** researchers with tools; **strong** merger; optional small sanitizer; frontier only where evals justify cost.
- **Orchestration** — **Fixed parallel** subtopic research (max 5) + **optional one gap-fill pass** per thin subtopic (bounded), not an unbounded recursive tree.
- **Rollout** — `TOPIC_SEARCH_PIPELINE=legacy|llm_v1` (or `search_version` / `pipeline` column); **production default is `llm_v1`**; set `TOPIC_SEARCH_PIPELINE=legacy` to opt out.

## Goals

- G1: Ship a **flagged** `llm_v1` pipeline that produces a **completed** `topic_searches` row **indistinguishable** from the client’s perspective on the **results** page (same fields, same components).
- G2: **Subtopic planning** — user topic → ≤5 subtopics; **user can add/delete/rename** before research runs.
- G3: **Evidence-grounded** — citations and topic sources **filtered to URLs returned by tools** (generalize today’s `validateTopicSources` pattern).
- G4: **Operational** — per-stage token/tool metrics, cost caps, and structured logs for debugging.
- G5: **Safe rollback** — one env flag or config returns to **legacy** pipeline without code removal.

## Non-goals (out of scope)

- NG1: Replacing **PDF layout**, share tokens, or unrelated routes.
- NG2: **Full browser farm** / headless TikTok at scale in v1 (optional `fetch_rendered` later).
- NG3: **Removing** Brave/Apify from the codebase in v1 — only **bypass** on `llm_v1` path behind flag.
- NG4: **Perfect** parity with “Deep” scrape volume for every platform.
- NG5: **Public** unauthenticated access to new endpoints.

---

## Clarifying choices (resolved defaults for Ralph)

| # | Question | Default for this PRD |
|---|----------|----------------------|
| 1 | Subtopic step before processing? | **Yes — blocking.** User must confirm subtopics before `process` runs. |
| 2 | New DB status vs overload `processing`? | **Add explicit status** `pending_subtopics` (or `awaiting_subtopics`) for clarity. |
| 3 | Ship UI first or admin? | **Admin first**; portal reuses same APIs once stable. |
| 4 | Primary search tool? | **Brave Search API** (already integrated). |
| 5 | Source storage shape? | `research_sources` **jsonb** + adapter to existing Source browser / `platform_data` as needed — **no second UI** for sources. |

---

## User stories

### US-001: Schema + migration for pipeline v3

**Description:** As a developer, I need to persist subtopics, pipeline version, and research sources so the new flow is durable and debuggable.

**Acceptance criteria:**

- [x] Migration adds `subtopics` jsonb (or `text[]` with documented shape), `pipeline` enum or integer `search_version = 3` for `llm_v1`, optional `pipeline_state` jsonb.
- [x] Migration adds `research_sources` jsonb (array of `{ url, title?, platform?, snippet?, subtopic_index?, fetched_at? }`) or agreed equivalent.
- [x] Types updated in `lib/types/search.ts` (or adjacent) to match.
- [x] `supabase:migrate` applies cleanly; `npx tsc --noEmit` passes.

---

### US-002: Tool layer — `search_web` + `fetch_url`

**Description:** As a developer, I need shared server-side tools so research agents retrieve real URLs and text, not hallucinations.

**Acceptance criteria:**

- [x] `lib/search/tools/` (or similar) implements `searchWeb(query, options)` → ranked list with URL, title, snippet (Brave-backed).
- [x] `fetchUrl(url)` → extracted text with **max length** cap, timeout, and error handling.
- [x] URL **normalize + dedupe** helpers; optional **domain rate limit** (per-host throttle) — **deferred** (not required for v1).
- [x] Unit tests for normalize/dedupe; mock integration test for happy path.
- [x] `npx tsc --noEmit` passes.

---

### US-003: Citation validator (tool URL allowlist)

**Description:** As a developer, I need to filter AI-attached sources to URLs that appeared in tool results (same idea as `validateTopicSources` in `process/route.ts`).

**Acceptance criteria:**

- [x] Given `Set<string>` of allowed URLs (from tool log) + `TopicSearchAIResponse`, strip **topic.sources** (and any other URL lists) not in set.
- [x] Exported function with tests (empty allowlist, partial match, normalized URL match).
- [x] `npx tsc --noEmit` passes.

---

### US-004: Zod schemas for planner, subtopic report, merger output

**Description:** As a developer, I need strict JSON contracts for each LLM stage.

**Acceptance criteria:**

- [x] `PlannerOutput`: `{ subtopics: string[] }` max 5.
- [x] `SubtopicReport`: findings, themes, sources[], optional `open_questions[]`.
- [x] `MergedTopicSearchPayload`: matches fields needed to write `topic_searches` + `raw_ai_response`.
- [x] Schemas live in `lib/search/llm-pipeline/` (or agreed path); used by routes and tests.
- [x] `npx tsc --noEmit` passes.

---

### US-005: Planner LLM endpoint — propose subtopics

**Description:** As an admin user, I want the system to propose **up to five** subtopics from my topic so I can edit them before research.

**Acceptance criteria:**

- [x] New route e.g. `POST /api/search/[id]/plan-subtopics` (or `POST /api/search/plan` with body `{ query }`) returns `{ subtopics: string[] }` (max 5).
- [x] Auth + ownership checks consistent with `app/api/search/[id]/route.ts`.
- [x] Uses cheap model; validates with `PlannerOutput` schema.
- [x] `npx tsc --noEmit` passes.

---

### US-006: Persist confirmed subtopics

**Description:** As an admin user, I want to **save** my edited subtopic list before research starts.

**Acceptance criteria:**

- [x] New route e.g. `PATCH /api/search/[id]/subtopics` with `{ subtopics: string[] }` (1–5 items).
- [x] Updates row; transitions status from `pending_subtopics` → `processing` when `start_processing: true` (otherwise stays `pending_subtopics`).
- [x] Zod validation; rejects >5 or 0.
- [x] `npx tsc --noEmit` passes.

---

### US-007: Core orchestrator `runLlmTopicPipeline(searchId)`

**Description:** As a developer, I need one module that runs parallel research + merger + DB write.

**Acceptance criteria:**

- [x] `lib/search/llm-pipeline/run-llm-topic-pipeline.ts` loads search + client context (caller supplies row fields).
- [x] Runs N `Promise.all` research calls (concurrency cap, e.g. 4) with tool budgets.
- [x] Calls merger LLM; produces `TopicSearchAIResponse` + `summary` + optional `brand_alignment_notes` for `client_strategy`.
- [x] Applies citation validator against **tool URL set**.
- [x] Writes `topic_searches` to `completed` with `summary`, `raw_ai_response`, `metrics`/`emotions`/`trending_topics` as compatible with existing UI.
- [x] `npx tsc --noEmit` passes.

---

### US-008: Branch `POST /api/search/[id]/process` (legacy vs v3)

**Description:** As a developer, I need the existing process route to call the new pipeline when flagged.

**Acceptance criteria:**

- [x] If `TOPIC_SEARCH_PIPELINE=llm_v1` (or `search_version`/`pipeline` match), invoke `runLlmTopicPipeline` instead of Brave/platform router path.
- [x] Legacy path unchanged when flag is off.
- [x] `maxDuration` and lease behavior documented; if pipeline exceeds limits, consider follow-up story for chunked jobs.
- [x] `npx tsc --noEmit` passes.

---

### US-009: Admin UI — subtopic planning step

**Description:** As an admin user, I want to **see proposed subtopics, edit them, and confirm** before research runs.

**Acceptance criteria:**

- [x] After creating a search (or on new-search flow), user sees **list of up to 5** subtopics with add/remove/edit.
- [x] **Confirm** calls `PATCH /subtopics` then triggers `POST /process` (or single flow documented).
- [x] Error states (API failure) show toast/message.
- [x] `npx tsc --noEmit` passes.
- [x] Verify in browser (admin new search → subtopics → process → results).

---

### US-010: Processing page + results parity

**Description:** As an admin user, I want the **processing** and **results** pages to behave like today.

**Acceptance criteria:**

- [x] Status transitions visible; user lands on results when `completed`.
- [x] Results page shows **Executive summary** (topic) + **Brand alignment** when present (existing behavior).
- [x] Source browser / list shows **research sources** from new pipeline (via adapter).
- [x] `npx tsc --noEmit` passes.
- [x] Verify in browser end-to-end on `llm_v1` path.

---

### US-011: Observability + cost caps

**Description:** As an operator, I need logs and hard limits so one search cannot exhaust budget.

**Acceptance criteria:**

- [x] Log per stage: tokens (if available), duration, tool call counts, errors.
- [x] Env-configurable: max tool calls per subtopic, max fetches, max merger tokens (or documented defaults).
- [x] Failed subtopic: row `failed` with `summary` or error message in existing pattern.

---

### US-012: E2E smoke (optional flag)

**Description:** As a developer, I want a Playwright smoke that runs when `llm_v1` is enabled in test env.

**Acceptance criteria:**

- [x] Skipped by default or behind env; documents required env vars.
- [x] `npm run test:e2e` still passes when feature off.

---

## Functional requirements

- **FR-1:** System must support **two pipelines**: **legacy** (current Brave + platform) and **llm_v1** (planner + research agents + merger), selected by **env and/or DB field**.
- **FR-2:** User must enter **one topic**; system must propose **≤5 subtopics**; user must **confirm 1–5** before research.
- **FR-3:** Each subtopic research agent must have access to **`search_web`** and **`fetch_url`**; responses must be **JSON** validating `SubtopicReport`.
- **FR-4:** Merger must output data compatible with **`TopicSearchAIResponse`** and **`topic_searches.summary`**; **topic summary** must not be client-brand-only when `client_strategy` also needs `brand_alignment_notes`.
- **FR-5:** All **source URLs** attached to topics must be **subset of tool-returned URLs** (after normalization).
- **FR-6:** System must **dedupe** sources across subtopics before merge.
- **FR-7:** **Admin** API routes must enforce **auth** and **same** org/client scoping as existing search routes.
- **FR-8:** Pipeline must respect **concurrency cap** (e.g. max 4 parallel researchers) and **tool budgets**.

## Design considerations

- **Reuse:** `ExecutiveSummary`, `TrendingTopicsTable`, `SourceBrowser`, `MetricsRow`, `app/admin/search/[id]/results-client.tsx` — **no redesign** of layout.
- **New UI:** Minimal **subtopic editor** on new-search path only; **dark theme**, sentence case, existing `Button`/`Card` patterns per `docs/conventions.md` and `docs/detail-design-patterns.md`.

## Technical considerations

- **Entry points:** `app/api/search/start/route.ts`, `app/api/search/[id]/process/route.ts`, `lib/prompts/*.ts`, `lib/ai/client.ts`.
- **Validation pattern:** Mirror `validateTopicSources` in `process/route.ts` but use **tool URL set** instead of `buildSerpUrlSet`.
- **Vault:** `syncSearchToVault` — confirm behavior with new pipeline or gate until v2.
- **Long-running:** `maxDuration` 800s on process route; if pipeline risks timeout, split into **async job** + polling (future story).

## Success metrics

- **SM-1:** 100% of **required** UI fields render for `llm_v1` completed rows (no blank executive summary when sources exist).
- **SM-2:** ≥90% of **source URLs** on a sample of 10 internal runs are **reachable** (HTTP 200) — spot-check.
- **SM-3:** Median wall-clock **≤ legacy Deep** for same topic (measure in staging), or **document** trade-off.
- **SM-4:** **Zero** production incidents requiring emergency disable — flag must work in **&lt;5 minutes**.

## Open questions

- **OQ-1:** Exact **status enum** values for `pending_subtopics` / `ready_to_process` vs reusing `pending`/`processing`.
- **OQ-2:** When `llm_v1` is default, do we **delete** legacy code paths or keep **12+ months** for enterprise?
- **OQ-3:** **Portal** date to ship subtopic UI after admin — same sprint or +1?

---

## Ralph loop backlog (implementation order)

Use this order for `/ralph` or queue tasks; each item maps to **US-xxx** above.

| Phase | Order | Story ID | Dependency |
|-------|-------|----------|------------|
| 1 | 1 | US-001 | — |
| 1 | 2 | US-002 | US-001 |
| 1 | 3 | US-003 | US-002 |
| 1 | 4 | US-004 | — |
| 2 | 5 | US-005 | US-001, US-004 |
| 2 | 6 | US-006 | US-001, US-004 |
| 3 | 7 | US-007 | US-002, US-003, US-004, US-006 |
| 3 | 8 | US-008 | US-007 |
| 4 | 9 | US-009 | US-005, US-006, US-008 |
| 4 | 10 | US-010 | US-009 |
| 5 | 11 | US-011 | US-007 |
| 5 | 12 | US-012 | US-010 |

**Definition of done (pipeline):** US-008 + US-009 + US-010 + US-011 complete; flag `llm_v1` can be enabled in staging.

---

## Appendix: File touchpoints (expected)

| Area | Files (illustrative) |
|------|----------------------|
| API | `app/api/search/start/route.ts`, `app/api/search/[id]/process/route.ts`, new `plan` / `subtopics` routes |
| Pipeline | `lib/search/llm-pipeline/run-llm-topic-pipeline.ts`, `lib/search/tools/*`, `lib/search/llm-pipeline/schemas.ts`, `lib/search/llm-pipeline/limits.ts` |
| Prompts | `lib/prompts/` new planner + researcher + merger prompts |
| Types | `lib/types/search.ts`, DB types |
| UI | `app/admin/search/new/*` or equivalent new-search flow |
| Tests | `tests/topic-search-llm-v1-api.spec.ts` (auth smoke), `lib/search/tools/urls.test.ts`, `lib/search/llm-pipeline/citation-validator.test.ts` |

---

*Implementation complete as of 2026-03-25 — stories US-001–US-012 satisfied. Default pipeline is **`llm_v1`**; apply migration `071_topic_search_llm_pipeline.sql` and set `BRAVE_SEARCH_API_KEY` on the server.*

## Appendix: Environment variables (llm_v1)

| Variable | Purpose |
|----------|---------|
| `TOPIC_SEARCH_PIPELINE` | **`llm_v1` by default** (omit or any value except `legacy`). Set to `legacy` to use the old Brave + platform scrape pipeline only. |
| `TOPIC_SEARCH_PLANNER_MODEL` | Planner subtopics model (default `openai/gpt-4o-mini`). |
| `TOPIC_SEARCH_RESEARCH_MODEL` | Per-subtopic research model. |
| `TOPIC_SEARCH_MERGER_MODEL` | Merger model (optional; gateway default if unset). |
| `TOPIC_SEARCH_MAX_PARALLEL` | Parallel subtopic researchers (default `4`, hard-capped at `8`). |
| `TOPIC_SEARCH_MAX_SEARCHES_PER_SUBTOPIC` | Brave result count per subtopic (default `10`). |
| `TOPIC_SEARCH_MAX_FETCHES_PER_SUBTOPIC` | URL fetches per subtopic (default `3`). |
| `TOPIC_SEARCH_MAX_MERGER_TOKENS` | Merger completion cap (default `6000`). |
| `TOPIC_SEARCH_MAX_RESEARCH_TOKENS` | Research completion cap (default `2500`). |
| `BRAVE_SEARCH_API_KEY` | Required for `searchWeb` / tool research. |
