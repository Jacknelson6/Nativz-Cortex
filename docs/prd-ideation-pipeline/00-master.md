# Ideation pipeline — master PRD

**Status:** Implementation in progress  
**Goal:** Tie **topic search → moodboard (analysis) → video ideas → scripts** into one coherent admin flow with visible handoffs.

## End-to-end story (Nativz workflow)

1. **Strategy context** — Brand DNA, client profile, strategy notes, meeting knowledge (existing KB).
2. **Topic research** — `topic_searches` via `/admin/search/new` → processing → results.
3. **Social proof on canvas** — High-engagement video URLs from research → `moodboard_boards` + `moodboard_items` → `/admin/analysis/[id]` for AI breakdown.
4. **Idea generation** — `POST /api/ideas/generate` with `search_id` (existing) → `/admin/ideas/[generationId]`.
5. **Production** — Scripts via `/api/ideas/generate-script`; save ideas to `client_knowledge_entries` (existing).

## System map (existing surfaces)

| Stage | Route / API | Data |
|-------|-------------|------|
| Research | `/admin/search/new`, `/admin/search/[id]` | `topic_searches` |
| Processing | `POST /api/search/[id]/process` | fills `platform_data`, `trending_topics`, etc. |
| Moodboard list | `/admin/analysis` | `moodboard_boards` |
| Moodboard canvas | `/admin/analysis/[id]` | `moodboard_items` |
| Ideas hub | `/admin/ideas`, `/admin/ideas/[id]` | `idea_generations`, `search_id` FK |
| Topic → ideas shortcut | Search results “Create video ideas” | `SearchIdeasWizard` |

## New links (this work)

- DB: `moodboard_boards.source_topic_search_id` → `topic_searches(id)`.
- API: `POST /api/analysis/boards/from-topic-search` — board + video items from research, optional background `processVideoItem`.
- UI: **Ideation pipeline** panel on search results; charts block **Listening insights**; backlinks from ideas + moodboard to originating search.

## Segment PRDs

- `01-topic-research.md` — inputs, outputs, handoff triggers.
- `02-moodboard-bridge.md` — URL extraction, board creation, analysis.
- `03-ideas-and-scripts.md` — search-grounded generation, pillars, scripts.
- `04-metrics-and-charts.md` — Recharts from `platform_breakdown` / topics.
- `05-atomic-checklist.md` — one–two action steps for execution.

## Out of scope (this pass)

- **Dedicated “strategy session capture” UI** — use existing Brand DNA, client profile, and knowledge entries as the guiding light (already fed into idea generation).
- **BuzzAbout / third-party listening** — external; Cortex ingests via topic search + platform gather.
- **Auto storyboard + shot list beyond spoken script** — script generation exists; richer production breakdown is a follow-up feature.
