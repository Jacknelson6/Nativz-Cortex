# PRD: VFF · 07 · Netflix-style UI shell

> Viral Format Finder · 07/10 · 2026-05-10

## Purpose & Value

Build the surface. A hero spotlight at the top, horizontal-scrolling rows below, dark theme, snappy. This is the moment Format Finder stops being a database and starts being a product the strategist opens on purpose. After this PRD, all the analyzed video data finally surfaces in a way that signals editorial curation.

## Problem

A list view of analyzed videos is not the product; we already have list views elsewhere. The Netflix layout matters because it implies curation: "these rows were chosen for YOU and THIS BRAND." It signals judgment, not search. Without it, strategists treat the library as a database lookup tool and stop opening it.

## Primary User

Internal strategists. They live in this surface 10-30 min/day.

## SMART Goals

- First-paint p95 <=1.5s on a brand with >=200 analyzed videos.
- 8 distinct row strategies all render correctly (with empty-state fallback when a strategy yields zero results).
- Horizontal scroll snaps to card boundaries on touch + trackpad + chevron click.
- Brand-pill switch reorders + refilters all rows in <=400ms (no full page reload).
- Visual QA Jack-approved against admin shell tokens; zero "looks like a different app" complaints.

## User Stories

- **US-01** — As a strategist, I open `/admin/formats` (brand pill bound), see a hero card + 8 rows of formats organized by strategy.
- **US-02** — As a strategist, I horizontally scroll a row with trackpad, wheel, or arrow chevrons; cards snap.
- **US-03** — As a strategist, switching brand via the top bar pill reorders + refilters rows immediately without a page reload.
- **US-04** — As a strategist on a 14" laptop, the rows fit 5-6 cards across without crowding.
- **US-05** — As a strategist on a new brand (no analyzed videos yet), I see a "Seeding your brand library" banner + generic For-You rows pulled from global high-relevance content.

## In Scope

- Page: `app/admin/formats/page.tsx` REPLACES VFF-01's empty-state shell.
- API: `GET /api/admin/formats/feed` returning a batched row payload.
- Components:
  - `components/formats/format-hero.tsx` — top spotlight with autoplay-on-hover preview.
  - `components/formats/format-row.tsx` — horizontal lane with snap + chevron buttons + lazy load.
  - `components/formats/format-grid.tsx` — composer stacking hero + rows.
  - `components/formats/format-row-skeleton.tsx` — loading placeholder.
  - `components/formats/format-row-empty.tsx` — empty-row state.
- Row strategies (8) keyed by `strategy_id`:
  1. `for_you` — top 10 by cosine similarity to brand seed_embedding, mixed dimensions.
  2. `trending_in_niche` — top by 7-day `views_count / age_days` velocity within seed terms.
  3. `top_hooks_this_week` — grouped by top-3 `hook_type`s (1 row each is too many; render this as ONE row with `hook_type` chips overlaid).
  4. `comparison_hooks` — filtered by `hook_type = 'comparison_hook'`.
  5. `pov_stories` — filtered by `structure = 'pov_story'`.
  6. `worth_stealing_from_competitors` — videos sourced from brand's confirmed competitors (joins `client_competitors` via creator handle match).
  7. `recently_analyzed` — newest 20.
  8. `saved_pinned` — `viral_collection_videos` for this brand (introduced in VFF-09).
- Brand pill binding: reuse `components/layout/admin-brand-pill.tsx` (do not introduce a new picker).
- Loading skeletons + empty states per row.
- Page-level cache: 60s in-memory cache keyed by `client_id` (Next.js `unstable_cache` or simple `Map` keyed by brand).

## Out of Scope

- The 9:16 card itself (VFF-08; replaces a placeholder card here).
- The expanded detail view (VFF-09).
- Mobile portal experience.
- Search bar (deferred; rows are the discovery surface).
- Manual "discover more" trigger (deferred).

## Resolved Decisions

- **D-01** — Hero autoplay sound? **→ Muted by default, hover-to-play.** Rationale: matches Netflix; respects autoplay restrictions.
- **D-02** — Row count cap? **→ 8 rows fixed.** Rationale: more than 8 feels infinite-scroll-y; 8 already overstuffs.
- **D-03** — Brand with zero analyzed videos? **→ Generic "For You" rows pulled from cross-brand top-cosine content + seeding banner.** Rationale: empty state for a new brand is fatal to perceived value.
- **D-04** — How is the For-You row computed? **→ Top 10 by `vector_cosine_ops` between `brand_format_context.seed_embedding` and `viral_videos.embedding`, filter `analysis_status = 'analyzed'`, no per-format cap.** Rationale: simplest measurable definition of "fit."
- **D-05** — Should rows lazy-load or batch one payload? **→ Single batched `/api/admin/formats/feed` request returning ALL 8 rows × up to 16 videos each.** Rationale: ~128 rows of metadata + thumbnails is well under 800KB; one round-trip is faster than 8 lazy ones.
- **D-06** — Trending velocity window? **→ 7 days.** Rationale: short enough to catch trends, long enough to not over-fit yesterday's spike.
- **D-07** — Brand pill change behavior? **→ Client-side state, refetch feed via SWR mutate.** Rationale: no full page reload; persists scroll on other surfaces.
- **D-08** — Cache TTL? **→ 60 seconds in-memory.** Rationale: balances freshness against repeat clicks of the brand pill.
- **D-09** — When the For-You strategy returns fewer than 5 results? **→ Backfill with global top-cosine; show a small badge "Mixed with global" on the row header.** Rationale: never show a row with 2 cards.

## Data Model

No new tables. Reads from `viral_videos`, `viral_video_formats`, `viral_formats`, `viral_collections`, `viral_collection_videos`, `client_competitors`, `brand_format_context`.

## API Contracts

### `GET /api/admin/formats/feed`
Auth: admin.
Query (Zod):
```ts
const FeedQuerySchema = z.object({
  client_id: z.string().uuid(),
  row_cap: z.coerce.number().int().min(4).max(20).default(16),  // per-row card cap
});
```
Response (200):
```ts
{
  client_id: string;
  seeding: boolean;                              // true if <20 analyzed videos for this brand
  hero: ViralVideoCard | null;
  rows: Array<{
    strategy_id:
      | 'for_you'
      | 'trending_in_niche'
      | 'top_hooks_this_week'
      | 'comparison_hooks'
      | 'pov_stories'
      | 'worth_stealing_from_competitors'
      | 'recently_analyzed'
      | 'saved_pinned';
    title: string;
    subtitle: string | null;
    badge: { label: string; tone: 'accent' | 'muted' } | null;
    videos: ViralVideoCard[];
  }>;
}

type ViralVideoCard = {
  id: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  source_url: string;
  thumbnail_storage_url: string | null;
  thumbnail_source_url: string | null;
  title: string | null;
  engagement_hook_descriptor: string | null;
  creator_handle: string | null;
  views_count: number | null;
  posted_at: string | null;
  hook_type_slug: string | null;
  hook_type_label: string | null;
  brand_relevance: 'high' | 'medium' | 'low' | null;  // bucketed cosine; null if no embedding
};
```
Errors: 400, 401, 403, 404 (client not found), 500.

## LLM Prompts

None.

## UI Components

### `app/admin/formats/page.tsx`
Server component fetches feed on initial render (using current brand-pill state from cookies/localStorage on client); client island handles brand pill changes via SWR.

Page layout:
```
<PageShell>
  <PageHeader title="Viral formats" subtitle="Curated short-form formats for {brand_name}" />
  {seeding && <SeedingBanner />}
  <FormatHero video={hero} />
  <div className="space-y-10 mt-8">
    {rows.map(row => <FormatRow key={row.strategy_id} row={row} />)}
  </div>
</PageShell>
```

Copy:
- H1: "Viral formats"
- Subtitle: "Curated short-form formats for {brand_name}"
- Seeding banner: "Seeding your library, check back in 24 hours. These rows are mixed with global top picks for now."
- Row titles:
  - `for_you` → "For {brand_name}"
  - `trending_in_niche` → "Trending in your niche"
  - `top_hooks_this_week` → "Top hooks this week"
  - `comparison_hooks` → "Comparison hooks"
  - `pov_stories` → "POV stories"
  - `worth_stealing_from_competitors` → "Worth stealing from competitors"
  - `recently_analyzed` → "Recently analyzed"
  - `saved_pinned` → "Saved by your team"
- Row empty state: "No videos match this slice yet, check back tomorrow."
- Row mixed-global badge: "Mixed with global"

### `components/formats/format-hero.tsx`
Full-width spotlight, 16:9 aspect ratio on desktop with the 9:16 video center-cropped into the right third (Netflix-style key art).

Props:
```ts
type Props = {
  video: ViralVideoCard | null;
};
```

Layout:
- Background: large blurred thumbnail across the row.
- Left 60%: text block — kicker ("Top pick"), title, hook descriptor, CTA "Open detail" + secondary "Save."
- Right 40%: 9:16 thumbnail with hover-autoplay (muted MP4 if available, else still).

States: loading (skeleton), empty (no card; hero hides), error (renders text-only with a "Library is warming up" message).

### `components/formats/format-row.tsx`
Horizontal lane.

Props:
```ts
type Props = {
  row: {
    strategy_id: string;
    title: string;
    subtitle: string | null;
    badge: { label: string; tone: 'accent' | 'muted' } | null;
    videos: ViralVideoCard[];
  };
};
```

Layout:
- Header line: row title, optional subtitle, optional badge (right side).
- Scroll container: `overflow-x-auto snap-x snap-mandatory scrollbar-thin`, cards spaced with `gap-3`.
- Left/right chevron buttons (visible on hover, hidden on mobile).
- Each card placeholder (replaced by VFF-08 component): `aspect-[9/16] w-44 bg-surface rounded-md` for v1 wireframe.

States: loading (5 skeleton cards), empty (1 muted message card "No videos match this slice yet, check back tomorrow.").

### `components/formats/format-grid.tsx`
Page composer; pure layout.

### `components/formats/format-row-skeleton.tsx`
6 placeholder cards.

### `components/formats/format-row-empty.tsx`
Single empty-state card with copy "No videos match this slice yet, check back tomorrow."

### Brand pill change handler
On `components/layout/admin-brand-pill.tsx` change → emits a `brandIdChange` event already consumed by other admin pages (verify); page subscribes and re-runs SWR `mutate(/api/admin/formats/feed?client_id=...)`.

## File Map

Create:
- `app/api/admin/formats/feed/route.ts`
- `lib/analytics/format-feed.ts` (server-only helper: `buildFormatFeed(clientId, opts)` returning the response shape; reused by future portal route in VFF-10)
- `lib/analytics/format-feed.test.ts`
- `components/formats/format-hero.tsx`
- `components/formats/format-row.tsx`
- `components/formats/format-grid.tsx`
- `components/formats/format-row-skeleton.tsx`
- `components/formats/format-row-empty.tsx`
- `components/formats/seeding-banner.tsx`
- `tasks/ralph/vff-07-netflix-ui-shell/progress.txt`

Modify:
- `app/admin/formats/page.tsx` (replaces VFF-01 empty shell)
- `components/layout/admin-brand-pill.tsx` (verify it emits a brand-change event consumable by SWR; if not, add one)

## Env Vars

None new.

## Edge Cases

- **Brand has zero analyzed videos.** `seeding = true`; For-You + Trending rows backfill with global top-cosine; Saved/Pinned + Worth-Stealing rows render empty with the standard empty state.
- **Brand has no competitor handles.** Worth-Stealing row renders empty state.
- **Cosine query fails (vector index missing).** Catch and fall back to non-cosine For-You (latest by velocity); log to `api_error_log`.
- **Row gets <5 cards.** Backfill to 5 from global top-cosine (per D-09) and show "Mixed with global" badge; if still <5, render with whatever you have (no minimum hard floor).
- **Brand pill change while feed is loading.** SWR cancels in-flight; UI shows skeletons during fetch.
- **Hero MP4 unavailable.** Render still thumbnail; no autoplay attempt.
- **Slow network on horizontal scroll.** Cards already eagerly fetched as part of feed payload; thumbnails lazy-loaded.

## Test Plan

Unit:
- `lib/analytics/format-feed.test.ts`:
  - For-You returns top-cosine when brand has embedding.
  - Trending uses 7-day velocity formula.
  - Worth-Stealing matches `client_competitors.username` against `creator_handle`.
  - `seeding=true` triggers global backfill on For-You row.
  - Empty rows return with `videos: []` not omitted.

Integration:
- Hit `/api/admin/formats/feed?client_id=<seeded brand>`; payload has 8 rows + hero.

E2E (Playwright):
- Visit `/admin/formats`; screenshot baseline.
- Switch brand pill; assert feed refetches and row titles update.
- Hover hero; assert preview plays.

Manual QA:
- Verify p95 first-paint <=1.5s on a brand with 200+ videos via Vercel speed insights.
- Snap-scroll feels right on trackpad + wheel + chevron.
- Empty rows render the standard message; no broken layouts.

## Architecture Wiring

- Page uses `getAdminBrandFromCookies()` pattern (verify existing helper; if not, follow `feedback_analytics_brand_pill_only.md`).
- Feed route mirrors `/api/analytics/client-series` pattern: Zod query parse, admin client, single batched response.
- All charts/cards are `'use client'` (per CLAUDE.md conventions).
- `lib/analytics/format-feed.ts` is the single source for the row-building logic, reused for portal (VFF-10) read-only view.
- For-You cosine: Supabase pgvector `viral_videos.embedding <=> brand_format_context.seed_embedding` order ASC limit 10.

## Done When

- All 8 rows render with real data on a seeded brand.
- p95 first-paint <=1.5s verified via Vercel speed insights or local manual run.
- Visual QA Jack-approved against confirm-platforms baseline.
- Brand pill change reflows rows without page reload.
- `npx tsc --noEmit` clean, `npm run lint` clean.
- progress.txt fully `[x]`.
