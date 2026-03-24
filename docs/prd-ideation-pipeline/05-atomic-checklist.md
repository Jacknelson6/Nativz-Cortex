# Atomic checklist — ideation pipeline E2E

Each line is **1–2 actions** (create file / edit file / run command / click test).

## Documentation
- [x] Add `docs/prd-ideation-pipeline/00-master.md`.
- [x] Add segments `01`–`04` + this checklist.

## Database
- [x] Create `supabase/migrations/066_moodboard_source_topic_search.sql` with column + index.
- [ ] Run migration against dev DB (Supabase Dashboard SQL or CLI).

## Library
- [x] Add `lib/ideation/extract-video-candidates.ts` (`extractVideoCandidatesFromSearch`).

## API
- [x] Add `POST /api/analysis/boards/from-topic-search/route.ts`.
- [x] Patch `GET /api/analysis/boards` — filter `topic_search_id`.

## UI — search results
- [x] Add `components/ideation/ideation-pipeline-panel.tsx`.
- [x] Patch `app/admin/search/[id]/page.tsx` — load `linkedBoards`, pass props.
- [x] Patch `results-client.tsx` — render panel + `ListeningInsightsCharts`.

## UI — ideas
- [x] Patch `app/admin/ideas/[id]/types.ts` — add optional `searchId` to props.
- [x] Patch `page.tsx` + `results-client.tsx` — back link to search.

## UI — moodboard
- [x] Patch moodboard canvas header — if `source_topic_search_id`, show chip link.

## Verify
- [x] `npx tsc --noEmit`
- [x] `npm run lint` on touched files (warnings only on pre-existing ideas client lines)
- [ ] Manual: completed search → build board → open analysis → generate ideas → open ideas → back to search
