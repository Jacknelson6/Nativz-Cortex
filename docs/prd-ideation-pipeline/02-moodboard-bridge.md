# PRD — Moodboard bridge (segment 2)

## Purpose
Move **high-signal video URLs** from a topic search onto the analysis moodboard so `processVideoItem` can run hooks/transcripts.

## Existing behavior
- Boards: `POST /api/analysis/boards`, canvas `MoodboardCanvas`.
- Items: `POST /api/analysis/items` (metadata + optional transcribe trigger).
- Headless processing: `processVideoItem` in `lib/moodboard/process-video.ts`.

## New behavior
- `POST /api/analysis/boards/from-topic-search` with `{ search_id, name? }`:
  - Admin-only, search must be `completed`.
  - Creates board with `client_id` from search, `source_topic_search_id` = search id.
  - Dedupes URLs, sorts by engagement heuristic, caps items (e.g. 20).
  - Inserts `moodboard_items` (type `video`); `after()` schedules `processVideoItem` up to N items.

## Acceptance
- [ ] Board appears in `/admin/analysis` and opens with video nodes.
- [ ] Search results panel links **Open board** when a linked board exists.

## Atomic steps
1. Apply migration `066_moodboard_source_topic_search.sql`.
2. Implement `lib/ideation/extract-video-candidates.ts` (pure function + tests via manual run).
3. Add route `app/api/analysis/boards/from-topic-search/route.ts`.
4. Extend `GET /api/analysis/boards?topic_search_id=` for linked boards list.
5. Add `IdeationPipelinePanel` action → `fetch` POST → `router.push` to `/admin/analysis/[boardId]`.
