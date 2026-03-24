# PRD — Ideas & scripts (segment 3)

## Purpose
Turn research into **ranked video ideas**, then **spoken scripts** for production.

## Existing behavior
- `SearchIdeasWizard` → `POST /api/ideas/generate` with `search_id`, optional `client_id`, `reference_video_ids`.
- Results: `/admin/ideas/[id]` — scripts via `POST /api/ideas/generate-script`, save to KB.

## Enhancements (this work)
- Pipeline panel: **Create video ideas** opens existing wizard; **View idea sets** uses `linkedIdeas` (already on page).
- Breadcrumb: when `generation.search_id` set, **View full research** links to `/admin/search/[id]` (not only `/admin/search/new`).

## Acceptance
- [ ] From idea results, user can jump back to originating search in one click.
- [ ] Pipeline step 3 shows completed state when `idea_generations` rows exist for `search_id`.

## Atomic steps
1. Pass `searchId` from `app/admin/ideas/[id]/page.tsx` into `IdeasResultsClient`.
2. Replace generic “Back to research” with conditional link to `/admin/search/[searchId]`.
3. Reuse existing `SearchIdeasWizard` from pipeline CTA (no API change).
