# PRD — Listening insights charts (segment 4)

## Purpose
Give art-directed **Recharts** summaries on the search results page: platform mix + topic opportunity index.

## Data sources (existing)
- `raw_ai_response.platform_breakdown` — post/comment counts per platform.
- `trending_topics` — names + nested `video_ideas` lengths.

## UI
- New client component `ListeningInsightsCharts`:
  - **Platform mix** — horizontal bar or stacked bar of posts/comments.
  - **Topics by idea count** — bar chart of top topics by number of generated angles.

## Acceptance
- [ ] Renders on completed searches when breakdown or topics exist; graceful empty state otherwise.

## Atomic steps
1. Add `components/charts/listening-insights-charts.tsx`.
2. Import in `app/admin/search/[id]/results-client.tsx` below metrics row.
