# PRD: ZNA · 04 · Individual post grid with reliable thumbnails

> Zernio Analytics · 04/06 · 2026-05-10

## Purpose & Value

Render every recent post per client as a 9:16 card in a grid, with the real thumbnail, a platform pill, the publish date, and a headline metric. Thumbnails MUST always render: this is the single biggest "looks unprofessional" failure mode of existing analytics surfaces, since Zernio's thumbnail URLs expire and rate-limit. ZNA-04 persists thumbnails to Supabase Storage at sync time and serves from there, so a grid loaded 30 days after publish still renders 100 % of tiles. The grid feeds ZNA-05 (signals) and ZNA-06 (trajectory).

## Problem

`post_metrics` already exists and stores `thumbnail_url`. That URL is the Zernio CDN URL: it expires, gets rate-limited, and 50 % of grid loads in current internal dashboards show grey eye tiles. A grid of broken images is worse than no grid. Storage cost of persisting thumbnails is trivial (≈ 540 MB/month at 30 brands × 90 posts × 200 kB). The pattern already exists, `lib/audit/persist-scraped-images.ts` is the canonical helper.

The legacy `postara_posts` table referenced in the original short-form PRD was DROPPED in migration 270; `post_metrics` is the live table. ZNA-04 ALTERs `post_metrics`, does NOT create a new posts table.

## Primary User

Strategist reviewing recent posts (admin). Client browsing their feed equivalent in portal.

## SMART Goals

- 100 % of posts in the grid render a working thumbnail (persisted image OR platform-tinted fallback with brand mark; never broken-eye tile).
- Thumbnail persistence: when a post syncs from Zernio, the thumbnail lands in Supabase Storage `post-thumbnails/{client_id}/` within 2 minutes of the cron run.
- Grid loads p95 ≤ 800 ms for a 30-post window.
- After 30 days, thumbnails STILL render (no expired CDN failures); audited by a regression query selecting 100 random rows and HEAD-checking the `thumbnail_storage_url`.

## User Stories

- **US-01** — As a strategist, I open `/admin/analytics/zernio?clientId=X` and below the platform charts I see a grid of the brand's recent posts.
- **US-02** — As a strategist, I can filter the grid by platform (tiktok / instagram / facebook / youtube / all).
- **US-03** — As a strategist, I can sort by date, views, or engagement rate.
- **US-04** — As a strategist, each card shows: thumbnail, platform pill, posted date relative, headline metric (views), and a small "ER %" suffix.
- **US-05** — As a client viewer, on `/portal/analytics` I see the same grid scoped to my org, read only.
- **US-06** — As a system, if a thumbnail URL fails to fetch I retry once and store a `thumbnail_persist_failed_at` timestamp so I can re-attempt on the next run.

## In Scope

- Migration `285_post_metrics_thumbnail_storage.sql`: ALTER `post_metrics` ADD `thumbnail_storage_url`, `thumbnail_persisted_at`, `thumbnail_persist_failed_at`, `thumbnail_persist_attempts`. NO new table.
- `lib/analytics/post-thumbnail-persistence.ts` exporting `persistPostThumbnail(post)`, which downloads the Zernio CDN URL and uploads to Supabase Storage at `post-thumbnails/{client_id}/{post_id}.jpg`, returning the storage URL. Reuses `lib/audit/persist-scraped-images.ts` patterns.
- Hook the persistence step INTO the existing `app/api/cron/sync-reporting` cron via `lib/reporting/sync.ts`: after writing a `post_metrics` row, if `thumbnail_storage_url IS NULL` or `thumbnail_persist_failed_at` is more than 24 h ago, run persistence.
- Storage bucket `post-thumbnails` (created in migration; public read; service-role write).
- API:
  - `GET /api/analytics/zernio/posts` (admin) with filter + sort + cursor pagination.
  - `GET /api/portal/analytics/zernio/posts` (portal mirror).
- UI:
  - `components/analytics/post-grid.tsx` (server data → client filter/sort wrapper).
  - `components/analytics/post-card.tsx` (single 9:16 tile).
  - `components/analytics/post-grid-filter-bar.tsx` (platform + sort).
- TikTok watch-time gap: record `watch_time_seconds` as nullable, set to `null` for TikTok with a one-time note in the seed log; ZNA-04 does NOT fix the Zernio roadblock.

## Out of Scope

- Per-post good/bad signal badge (ZNA-05).
- Per-post engagement trajectory sparkline (ZNA-06).
- Editing post metadata in this view (display only).
- Cross-platform totals (ZNA-02 covers that).
- A new posts table; we extend `post_metrics`.

## Resolved Decisions

- **D-01** — Where do thumbnails get persisted from, dedicated job or inline in the existing cron? **→ Inline in `lib/reporting/sync.ts` after each `post_metrics` upsert.** Rationale: simplest atomic guarantee; one new cron route is unnecessary; per-row persistence runs under the existing 300 s cron budget.
- **D-02** — File format on storage? **→ JPEG, max width 720 px, quality 80 via `sharp`.** Rationale: 200 kB target; JPEG saves ~40 % vs PNG at imperceptible quality for thumbnails.
- **D-03** — Storage path? **→ `post-thumbnails/{client_id}/{post_id}.jpg`.** Rationale: cardinality is bounded; client_id prefix simplifies bulk-delete on client offboard.
- **D-04** — Bucket access? **→ Public read; service-role write.** Rationale: thumbnails are not sensitive; public read avoids signed URL churn.
- **D-05** — Re-fetch thumbnail on post edit? **→ Yes, on every sync the Zernio CDN URL is hashed; if hash changed since last persist, re-persist.** Rationale: caption edits sometimes regenerate thumbnails (Zernio behaviour); rare enough.
- **D-06** — Fallback when persist fails twice? **→ Render `<PlatformFallbackTile>` with platform-tinted gradient + brand mark (client avatar), NEVER a broken-eye placeholder.** Rationale: the explicit anti-pattern this PRD fixes.
- **D-07** — Headline metric on card? **→ Views.** Rationale: most universal across platforms; ER as small suffix.
- **D-08** — Card aspect? **→ 9:16.** Rationale: short-form video tile per CONTEXT.md UI tokens; matches VFF-08.
- **D-09** — Pagination? **→ Cursor-based on `published_at DESC` with `limit=30`, max `limit=100`.** Rationale: stable scroll position; no `OFFSET` churn.
- **D-10** — Window default? **→ Last 90 days.** Rationale: matches ZNA-02 "All" cap.
- **D-11** — Where is `client_id` scoped in portal route? **→ `getPortalClient()` derives `client_id`; query always joins `clients.organization_id = portal.org_id` (defense in depth even with RLS).** Rationale: portal hard rule.
- **D-12** — Sort options? **→ `published_at`, `views_count`, `engagement_rate`. Order: desc default.** Rationale: covers the obvious cases.
- **D-13** — Filter options? **→ Platform multi-select (chips, default all).** Rationale: smallest filter that delivers value; advanced filters defer.
- **D-14** — TikTok watch time? **→ Record as `null`; one-line comment in `lib/reporting/sync.ts` noting Zernio roadblock; no UI surfacing of the gap.** Rationale: tracked, not fixed.
- **D-15** — Engagement-rate denominator? **→ Views.** Rationale: `feedback_analytics_accuracy_pass_2026_04_23.md`.
- **D-16** — Render side for grid? **→ Server fetches first page (30 cards) for fast paint, client takes over for filter/sort/load-more.** Rationale: matches ZNA-02 hybrid pattern.
- **D-17** — Sharp dependency? **→ Already in repo via `lib/audit/persist-scraped-images.ts`; no new dep.** Rationale: confirmed via grep before adding.

## Data Model

### Migration `285_post_metrics_thumbnail_storage.sql`

```sql
-- ============================================================
-- ZNA-04: Reliable thumbnails on post_metrics.
-- Adds storage-backed thumbnail URL + persistence bookkeeping.
-- Does NOT create a new posts table. postara_posts was dropped in 270.
-- ============================================================

ALTER TABLE post_metrics
  ADD COLUMN IF NOT EXISTS thumbnail_storage_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_persisted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thumbnail_persist_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thumbnail_persist_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thumbnail_source_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_post_metrics_thumbnail_missing
  ON post_metrics (client_id, published_at DESC)
  WHERE thumbnail_storage_url IS NULL;

-- Public-read bucket for persisted thumbnails. Service role writes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-thumbnails', 'post-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket policies: anyone can read; service role can write/update/delete.
-- (RLS on storage.objects is already enabled by Supabase default.)
CREATE POLICY post_thumbnails_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'post-thumbnails');

CREATE POLICY post_thumbnails_service_write ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'post-thumbnails')
  WITH CHECK (bucket_id = 'post-thumbnails');
```

Note on idempotency: `INSERT ... ON CONFLICT DO NOTHING` and `CREATE POLICY IF NOT EXISTS` pattern. Supabase Postgres ≥ 15 supports `CREATE POLICY IF NOT EXISTS`; if running on 14, wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`. Apply task should verify version first.

## API Contracts

### `GET /api/analytics/zernio/posts` (admin)

Auth: admin.

Query:

```ts
const QuerySchema = z.object({
  client_id: z.string().uuid(),
  platforms: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(['tiktok','instagram','facebook','youtube'])).optional()),
  sort: z.enum(['published_at', 'views_count', 'engagement_rate']).default('published_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),               // base64-encoded {field_value, id}
  since_days: z.coerce.number().int().min(1).max(180).default(90),
});
```

Response (200):

```ts
type PostCard = {
  id: string;
  client_id: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  external_post_id: string;
  post_url: string;
  caption: string;
  post_type: string | null;
  published_at: string;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  engagement_rate: number;                     // views as denominator
  thumbnail_url: string;                       // storage if available, else CDN, else fallback marker
  thumbnail_source: 'storage' | 'cdn' | 'fallback';
  watch_time_seconds: number | null;           // null for TikTok per Zernio roadblock
};

type PostsResponse = {
  client_id: string;
  range_since_days: number;
  sort: 'published_at' | 'views_count' | 'engagement_rate';
  order: 'asc' | 'desc';
  posts: PostCard[];
  next_cursor: string | null;
};
```

Errors: 400, 401, 404 client not found, 500.

### `GET /api/portal/analytics/zernio/posts` (portal)

Auth: portal.

Query: same minus `client_id` (derived from `getPortalClient()`).

Behavior: hard org filter on join. Response identical shape.

Errors: 401, 403 paused, 500.

## LLM Prompts

None.

## TypeScript types + module shape

### `lib/analytics/post-thumbnail-persistence.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PersistPostThumbnailArgs {
  supabase: SupabaseClient;
  postMetricId: string;
  clientId: string;
  zernioThumbnailUrl: string | null;
  existingHash: string | null;
}

export interface PersistResult {
  status: 'persisted' | 'unchanged' | 'no_source' | 'fetch_failed' | 'upload_failed';
  storage_url?: string;
  source_hash?: string;
  attempts: number;
}

export async function persistPostThumbnail(args: PersistPostThumbnailArgs): Promise<PersistResult>;
```

Behavior:

1. If `zernioThumbnailUrl` is null → `no_source`; bump attempts.
2. Compute `source_hash = sha256(zernioThumbnailUrl)`. If equals `existingHash` and `thumbnail_storage_url` already populated → `unchanged`.
3. `fetch(zernioThumbnailUrl)` with 10 s timeout, `User-Agent: nativz-cortex-zna-04`. On non-200 → `fetch_failed`; bump attempts; set `thumbnail_persist_failed_at = now()`.
4. Pass buffer through `sharp().resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 80 })`.
5. Upload to bucket `post-thumbnails` at `${clientId}/${postMetricId}.jpg`, `upsert: true`, `contentType: image/jpeg`.
6. On upload failure → `upload_failed`; bump attempts; set `thumbnail_persist_failed_at = now()`.
7. On success: update `post_metrics` row with `thumbnail_storage_url`, `thumbnail_persisted_at = now()`, `thumbnail_persist_failed_at = null`, `thumbnail_source_hash = source_hash`; return `persisted`.

Reuses `getPublicUrl` semantics from `lib/audit/persist-scraped-images.ts`.

### `lib/reporting/sync.ts` hook

Inside the existing `upsertPostMetrics` path, after the row is written, append:

```ts
if (postRow.thumbnail_url && (
  !postRow.thumbnail_storage_url ||
  (postRow.thumbnail_persist_failed_at && hoursSince(postRow.thumbnail_persist_failed_at) >= 24)
)) {
  await persistPostThumbnail({
    supabase: adminClient,
    postMetricId: postRow.id,
    clientId: postRow.client_id,
    zernioThumbnailUrl: postRow.thumbnail_url,
    existingHash: postRow.thumbnail_source_hash,
  }).catch((err) => {
    console.error('[zna-04] thumbnail persist threw', { post_id: postRow.id, err });
  });
}
```

Run with `Promise.all` over post batch with concurrency cap 5.

### `lib/analytics/posts-query.ts`

```ts
export interface LoadPostsArgs {
  supabase: SupabaseClient;
  clientId: string;
  platforms?: Array<'tiktok'|'instagram'|'facebook'|'youtube'>;
  sort: 'published_at' | 'views_count' | 'engagement_rate';
  order: 'asc' | 'desc';
  limit: number;
  cursor?: string;
  sinceDays: number;
}

export interface LoadPostsResult {
  posts: PostCard[];
  nextCursor: string | null;
}

export async function loadPostsForGrid(args: LoadPostsArgs): Promise<LoadPostsResult>;
```

Cursor format: base64-encoded JSON `{ v: number; id: string }` where `v` is the sort field's value.

Cursor decode/encode helpers exported alongside.

When transforming each row to a `PostCard`, resolve `thumbnail_url`:

1. If `thumbnail_storage_url` present → `thumbnail_source: 'storage'`, url = storage public URL.
2. Else if `thumbnail_url` (Zernio CDN) present → `thumbnail_source: 'cdn'`, url = CDN.
3. Else → `thumbnail_source: 'fallback'`, url = sentinel `null` (component renders `<PlatformFallbackTile>`).

Engagement rate calculation: `views_count > 0 ? (likes + comments + shares) / views * 100 : 0`. Per ZNA-02 D-01, saves excluded.

## UI Components

### `components/analytics/post-card.tsx`

Top of file: `'use client'`.

Purpose: single 9:16 tile in the post grid.

Props:

```ts
type Props = {
  post: PostCard;
  isPortal?: boolean;
};
```

Layout:

- Outer `<a href={post.post_url} target="_blank" rel="noopener">` wrapping a `<div className="relative aspect-[9/16] w-full overflow-hidden rounded-lg bg-surface">`.
- Thumbnail: `<Image>` from `next/image` when `thumbnail_source !== 'fallback'`, `sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 45vw"`, `fill`, `priority={false}`.
- Fallback: `<PlatformFallbackTile platform={platform} brandAvatarUrl={...} />` (defined as inner sub-component or imported helper).
- Bottom gradient overlay: `bg-gradient-to-t from-black/85 via-black/40 to-transparent`, lower 40 %.
- Bottom content stack:
  - Top line: platform pill (small rounded full, platform-tinted, h-5 px-2 text-[11px]).
  - Bottom line left: relative date (`formatDistanceToNow(published_at)` + " ago"), text-xs muted.
  - Bottom line right: headline `views_count` (`Intl.NumberFormat compact`), text-sm font-semibold, with " · {er}% ER" suffix muted.
- Hover (lg+): scale 1.02; overlay opacity bumps; tooltip flyout shows likes / comments / shares.

Copy:

- Platform pill labels: "TikTok", "Instagram", "YouTube", "Facebook".
- ER suffix format: " · 4.2% ER".
- Hover tooltip lines: "{likes} likes", "{comments} comments", "{shares} shares".

States: success (image loaded), fallback (no thumbnail), loading (next/image blur or skeleton).

Tokens: `bg-surface`, platform tints (declared in `lib/social/platform-tokens.ts` if absent, derive on the fly: tiktok `bg-pink-500/20 text-pink-200`, instagram `bg-fuchsia-500/20 text-fuchsia-200`, youtube `bg-red-500/20 text-red-200`, facebook `bg-blue-500/20 text-blue-200`).

### `components/analytics/post-grid.tsx`

Top of file: `'use client'`.

Purpose: layout wrapper that lays out cards, handles filter / sort / load-more.

Props:

```ts
type Props = {
  initial: PostsResponse;
  fetchMore: (params: { cursor: string }) => Promise<PostsResponse>;
  isPortal?: boolean;
};
```

Layout:

- Filter bar at top (`<PostGridFilterBar />`).
- Grid: `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3`.
- Load-more button at bottom when `next_cursor` is not null. Button never wraps.

States: empty (no posts in window): single-row card with copy "No posts in the last {since_days} days." and a link to Content Calendar.

### `components/analytics/post-grid-filter-bar.tsx`

Top of file: `'use client'`.

Props:

```ts
type Props = {
  platforms: Array<'tiktok'|'instagram'|'facebook'|'youtube'>;
  selectedPlatforms: Array<'tiktok'|'instagram'|'facebook'|'youtube'>;
  onPlatformChange: (next: Array<'tiktok'|'instagram'|'facebook'|'youtube'>) => void;
  sort: 'published_at' | 'views_count' | 'engagement_rate';
  onSortChange: (next: 'published_at' | 'views_count' | 'engagement_rate') => void;
};
```

Copy:

- Sort labels: "Newest first", "Most views", "Highest engagement".
- Platform chip labels: "TikTok", "Instagram", "YouTube", "Facebook".
- Empty-selection helper text: "Pick at least one platform."

### `components/analytics/platform-fallback-tile.tsx`

Purpose: deterministic, never-broken fallback for posts without a thumbnail.

Props:

```ts
type Props = {
  platform: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  brandAvatarUrl?: string | null;
};
```

Layout: full-bleed gradient per platform; centered platform glyph (lucide-react icon) at 40 % opacity; brand avatar (round, h-14 w-14) bottom-left if provided. NEVER a broken-image element.

## File Map

Create:

- `supabase/migrations/285_post_metrics_thumbnail_storage.sql`
- `lib/analytics/post-thumbnail-persistence.ts`
- `lib/analytics/post-thumbnail-persistence.test.ts`
- `lib/analytics/posts-query.ts`
- `lib/analytics/posts-query.test.ts`
- `app/api/analytics/zernio/posts/route.ts`
- `app/api/portal/analytics/zernio/posts/route.ts`
- `components/analytics/post-card.tsx`
- `components/analytics/post-grid.tsx`
- `components/analytics/post-grid-filter-bar.tsx`
- `components/analytics/platform-fallback-tile.tsx`
- `tasks/ralph/zna-04-post-grid/progress.txt`

Modify:

- `lib/reporting/sync.ts` (hook persistPostThumbnail after each upsert).
- `app/admin/analytics/zernio/page.tsx` (mount `<PostGrid />` below platform cards).
- `app/portal/analytics/page.tsx` (mount `<PostGrid />` read only).
- `lib/supabase/types.ts` (regenerated for new columns).
- `next.config.ts` / `next.config.mjs` (add Supabase Storage hostname to `images.remotePatterns`).

## Env Vars

None new. Reuses `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`. The bucket is public read, no signed-URL token needed.

## Edge Cases

- **Zernio CDN URL is null.** Skip persistence; render `<PlatformFallbackTile>` in grid.
- **First persistence attempt fetches a 404 image.** Bump `thumbnail_persist_attempts`; set `thumbnail_persist_failed_at = now()`. Next sync waits 24 h before retry (per D-05).
- **Image is GIF / WebP.** `sharp` handles; output is JPEG. Static fallback if a corrupt buffer throws.
- **Image is HLS playlist / video, not a real image.** Sharp throws; treated as `fetch_failed`. (Should not happen; Zernio thumbnails are always still frames.)
- **Storage upload fails because bucket missing.** Migration creates the bucket; if migration ran but bucket creation skipped (race), retry on next sync.
- **Cursor decodes to a row outside the `since_days` window.** Server clamps; returns next-page empty.
- **`engagement_rate` is `null` in DB (legacy rows).** Recompute on the fly from `views_count` and (likes + comments + shares).
- **TikTok post with `watch_time_seconds = null`.** Card omits the watch-time field; no UI gap; ZNA-06 owns trajectory.
- **Portal user passes `client_id` in query string.** Route ignores it; uses `getPortalClient()` resolved client_id.
- **Two posts within same `published_at` second.** Cursor pair `{v: published_at, id}` disambiguates with `id` tiebreak.
- **Bucket reaches storage quota.** Persistence returns `upload_failed`; fallback renders; ops monitor `thumbnail_persist_failed_at` count.
- **Caption contains long URLs (overflow).** Caption is not rendered in the card (only on the detail view planned for later); no risk here.

## Test Plan

Unit:

- `lib/analytics/post-thumbnail-persistence.test.ts`: `no_source`, `unchanged` (hash match), `fetch_failed` (mocked 404), `upload_failed` (mocked supabase error), `persisted` happy path. Verify `thumbnail_persist_attempts` increments.
- `lib/analytics/posts-query.test.ts`: cursor encode/decode round trip, ER recompute with view denominator, thumbnail source resolution precedence, since_days window clamp.

Integration:

- API route `/api/analytics/zernio/posts`: returns 200 with 30 cards for seeded brand; cursor pagination yields next 30; filter by `platforms=tiktok,instagram` returns subset.
- Portal route returns identical shape scoped to portal session; cross-org client_id ignored.

Manual QA:

- Trigger `sync-reporting` on staging against Nike demo; observe `thumbnail_storage_url` populated within one cron run.
- Force a `fetch_failed` by mocking a non-existent CDN URL; observe fallback tile in the grid and `thumbnail_persist_failed_at` set.
- Visit `/admin/analytics/zernio?clientId=27b2baa6-17b0-4a14-a96a-005684d199fd` and scroll; verify zero broken-image tiles across 90 posts.
- HEAD-check a 30-day-old persisted URL; verify 200.

## Architecture Wiring

- Extends `post_metrics` (migration 021) via ALTER; no new table; the legacy `postara_posts` is gone (migration 270).
- Reuses image persistence pattern from `lib/audit/persist-scraped-images.ts`; same `sharp` pipeline; same Supabase Storage primitives.
- Hooked into existing `app/api/cron/sync-reporting` via `lib/reporting/sync.ts`; no new cron route.
- Reads `source` column from ZNA-01 to know whether thumbnails come from Zernio or scrape; persistence is source-agnostic.
- Renders inside `/admin/analytics/zernio` (ZNA-02 page) below the platform cards, and inside `/portal/analytics`.
- ZNA-05 and ZNA-06 attach signal badges and trajectory sparklines to each card; this PRD reserves the card surface for those slots in its layout comments.

## Done When

- Migration 285 applied; new columns present; bucket `post-thumbnails` exists with public read + service write policies.
- `npx tsc --noEmit` clean; `npm run lint` clean.
- After one `sync-reporting` cron run, at least 90 % of post rows for an active client have `thumbnail_storage_url` populated.
- Manual HEAD check on 100 random persisted URLs returns 200 for all.
- `/admin/analytics/zernio` renders the grid; zero broken-eye tiles in a 30-post sample.
- `/portal/analytics` renders identical grid scoped to org.
- Filter by platform and sort by views / ER work; load-more pagination works.
- Fallback tile renders correctly for a forced no-thumbnail post.
- TikTok rows show `watch_time_seconds: null` (gap noted, not fixed).
- progress.txt fully `[x]`.
