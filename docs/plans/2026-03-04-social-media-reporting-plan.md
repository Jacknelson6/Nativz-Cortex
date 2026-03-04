# Social Media Reporting Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `/admin/analytics` with a unified social media reporting dashboard that aggregates Instagram, TikTok, Facebook, and YouTube Shorts metrics with cumulative summaries and top-post discovery.

**Architecture:** Two new DB tables (`platform_snapshots`, `post_metrics`) store normalized cross-platform data. A provider-agnostic normalizer layer in `lib/reporting/` maps each platform's API response to a unified shape via Nango proxy. The UI is a single `'use client'` page with pill-toggled views (Summary / Top Posts), client selector, and date range presets. State kept in URL search params.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres), Nango SDK, Tailwind CSS v4, Recharts, lucide-react, Zod, sonner (toasts)

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/021_create_reporting_tables.sql`

**Step 1: Write the migration**

```sql
-- Social media reporting tables

-- Daily aggregate metrics per social profile
CREATE TABLE IF NOT EXISTS platform_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_profile_id UUID NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube')),
  snapshot_date DATE NOT NULL,
  followers_count INTEGER DEFAULT 0,
  followers_change INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  engagement_count INTEGER DEFAULT 0,
  engagement_rate NUMERIC,
  posts_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_snapshots_unique
  ON platform_snapshots(social_profile_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_platform_snapshots_client_date
  ON platform_snapshots(client_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_platform_snapshots_platform
  ON platform_snapshots(platform);

-- Per-post performance metrics
CREATE TABLE IF NOT EXISTS post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_profile_id UUID NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube')),
  external_post_id TEXT NOT NULL,
  post_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  post_type TEXT CHECK (post_type IN ('video', 'image', 'reel', 'short', 'carousel', 'story')),
  published_at TIMESTAMPTZ,
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  reach_count INTEGER DEFAULT 0,
  engagement_rate NUMERIC,
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_metrics_unique
  ON post_metrics(external_post_id, platform);
CREATE INDEX IF NOT EXISTS idx_post_metrics_client_date
  ON post_metrics(client_id, published_at);
CREATE INDEX IF NOT EXISTS idx_post_metrics_engagement
  ON post_metrics(client_id, platform, (likes_count + comments_count + shares_count + saves_count) DESC);

-- RLS
ALTER TABLE platform_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage platform_snapshots"
  ON platform_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage post_metrics"
  ON post_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Step 2: Run migration against Supabase**

Run: `npx supabase db push` or execute SQL directly in Supabase dashboard.

**Step 3: Commit**

```bash
git add supabase/migrations/021_create_reporting_tables.sql
git commit -m "feat(reporting): add platform_snapshots and post_metrics tables"
```

---

## Task 2: TypeScript Types

**Files:**
- Create: `lib/types/reporting.ts`
- Modify: `lib/types/database.ts` — add `PlatformSnapshot` and `PostMetric` exports

**Step 1: Create the types file**

```typescript
// lib/types/reporting.ts

export type SocialPlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube';

export type DateRangePreset = '7d' | '30d' | 'mtd' | 'ytd' | 'custom';

export interface DateRange {
  start: string; // ISO date YYYY-MM-DD
  end: string;
}

// Database row types
export interface PlatformSnapshot {
  id: string;
  social_profile_id: string;
  client_id: string;
  platform: SocialPlatform;
  snapshot_date: string;
  followers_count: number;
  followers_change: number;
  views_count: number;
  engagement_count: number;
  engagement_rate: number | null;
  posts_count: number;
  created_at: string;
}

export interface PostMetric {
  id: string;
  social_profile_id: string;
  client_id: string;
  platform: SocialPlatform;
  external_post_id: string;
  post_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  post_type: string | null;
  published_at: string | null;
  views_count: number;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  reach_count: number;
  engagement_rate: number | null;
  fetched_at: string;
}

// API response shapes
export interface PlatformSummary {
  platform: SocialPlatform;
  username: string;
  avatarUrl: string | null;
  followers: number;
  followerChange: number;
  totalViews: number;
  totalEngagement: number;
  engagementRate: number;
  postsCount: number;
}

export interface SummaryReport {
  combined: {
    totalViews: number;
    totalViewsChange: number;
    totalFollowerChange: number;
    totalFollowerChangeChange: number;
    totalEngagement: number;
    totalEngagementChange: number;
    avgEngagementRate: number;
    avgEngagementRateChange: number;
  };
  platforms: PlatformSummary[];
  dateRange: DateRange;
}

export interface TopPostItem {
  rank: number;
  id: string;
  platform: SocialPlatform;
  username: string;
  externalPostId: string;
  postUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postType: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  totalEngagement: number;
}

// Normalizer interface — each platform implements this
export interface NormalizedInsights {
  followers: number;
  followersChange: number;
  views: number;
  engagement: number;
  engagementRate: number;
  postsCount: number;
}

export interface NormalizedPost {
  externalPostId: string;
  postUrl: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postType: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
}

export interface PlatformNormalizer {
  platform: SocialPlatform;
  fetchInsights(connectionId: string, dateRange: DateRange): Promise<NormalizedInsights>;
  fetchPosts(connectionId: string, dateRange: DateRange): Promise<NormalizedPost[]>;
}
```

**Step 2: Commit**

```bash
git add lib/types/reporting.ts
git commit -m "feat(reporting): add TypeScript types for reporting"
```

---

## Task 3: Platform Normalizers

**Files:**
- Create: `lib/reporting/normalizers/instagram.ts`
- Create: `lib/reporting/normalizers/facebook.ts`
- Create: `lib/reporting/normalizers/tiktok.ts`
- Create: `lib/reporting/normalizers/youtube.ts`
- Create: `lib/reporting/normalizers/index.ts`

Each normalizer calls Nango's proxy API to fetch platform-specific data, then maps it to the `NormalizedInsights` / `NormalizedPost` shape.

**Step 1: Create the normalizer index**

```typescript
// lib/reporting/normalizers/index.ts
import type { PlatformNormalizer, SocialPlatform } from '@/lib/types/reporting';
import { instagramNormalizer } from './instagram';
import { facebookNormalizer } from './facebook';
import { tiktokNormalizer } from './tiktok';
import { youtubeNormalizer } from './youtube';

const normalizers: Record<SocialPlatform, PlatformNormalizer> = {
  instagram: instagramNormalizer,
  facebook: facebookNormalizer,
  tiktok: tiktokNormalizer,
  youtube: youtubeNormalizer,
};

export function getNormalizer(platform: SocialPlatform): PlatformNormalizer {
  return normalizers[platform];
}

export { normalizers };
```

**Step 2: Create Instagram normalizer**

Uses Instagram Graph API via Nango. The `access_token_ref` on `social_profiles` maps to a Nango connection ID for the `instagram-business` integration.

```typescript
// lib/reporting/normalizers/instagram.ts
import { Nango } from '@nangohq/node';
import type { PlatformNormalizer, DateRange, NormalizedInsights, NormalizedPost } from '@/lib/types/reporting';

const PROVIDER_KEY = 'instagram-business';

function getNango(): Nango {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) throw new Error('NANGO_SECRET_KEY not set');
  return new Nango({ secretKey });
}

export const instagramNormalizer: PlatformNormalizer = {
  platform: 'instagram',

  async fetchInsights(connectionId: string, dateRange: DateRange): Promise<NormalizedInsights> {
    const nango = getNango();

    try {
      // Get user profile for follower count
      const profileRes = await nango.get<{ followers_count: number; media_count: number }>({
        endpoint: '/me',
        providerConfigKey: PROVIDER_KEY,
        connectionId,
        params: { fields: 'followers_count,media_count' },
      });

      // Get insights for the period
      const insightsRes = await nango.get<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>({
        endpoint: '/me/insights',
        providerConfigKey: PROVIDER_KEY,
        connectionId,
        params: {
          metric: 'impressions,reach,follower_count',
          period: 'day',
          since: dateRange.start,
          until: dateRange.end,
        },
      });

      const metrics = insightsRes.data?.data ?? [];
      const impressions = metrics.find(m => m.name === 'impressions');
      const totalViews = (impressions?.values ?? []).reduce((sum, v) => sum + (v.value ?? 0), 0);

      return {
        followers: profileRes.data?.followers_count ?? 0,
        followersChange: 0, // Calculated from snapshots
        views: totalViews,
        engagement: 0, // Calculated from posts
        engagementRate: 0,
        postsCount: 0,
      };
    } catch (error) {
      console.error('[Instagram normalizer] fetchInsights error:', error);
      return { followers: 0, followersChange: 0, views: 0, engagement: 0, engagementRate: 0, postsCount: 0 };
    }
  },

  async fetchPosts(connectionId: string, dateRange: DateRange): Promise<NormalizedPost[]> {
    const nango = getNango();

    try {
      const res = await nango.get<{ data: Array<Record<string, unknown>> }>({
        endpoint: '/me/media',
        providerConfigKey: PROVIDER_KEY,
        connectionId,
        params: {
          fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
          limit: '100',
        },
      });

      const posts = (res.data?.data ?? [])
        .filter(p => {
          const ts = p.timestamp as string;
          return ts >= dateRange.start && ts <= dateRange.end;
        })
        .map(p => ({
          externalPostId: p.id as string,
          postUrl: (p.permalink as string) ?? null,
          thumbnailUrl: (p.thumbnail_url as string) ?? (p.media_url as string) ?? null,
          caption: (p.caption as string) ?? null,
          postType: ((p.media_type as string) ?? 'image').toLowerCase(),
          publishedAt: p.timestamp as string,
          views: 0,
          likes: (p.like_count as number) ?? 0,
          comments: (p.comments_count as number) ?? 0,
          shares: 0,
          saves: 0,
          reach: 0,
        }));

      return posts;
    } catch (error) {
      console.error('[Instagram normalizer] fetchPosts error:', error);
      return [];
    }
  },
};
```

**Step 3: Create Facebook normalizer** — same pattern, uses `facebook-pages` Nango integration, hits `/me/posts` and `/me/insights`.

**Step 4: Create TikTok normalizer** — uses `tiktok-business` Nango integration, hits TikTok Business API `/video/list/` and `/video/query/`.

**Step 5: Create YouTube normalizer** — uses `youtube-analytics` Nango integration, hits YouTube Data API `/channels` and `/search` + `/videos` for shorts.

> **Note for implementer:** Each normalizer follows the exact same pattern as Instagram. The key differences are the `PROVIDER_KEY`, the API endpoints, and the field mapping. If a Nango integration isn't configured yet, the normalizer's try/catch returns empty data gracefully.

**Step 6: Commit**

```bash
git add lib/reporting/normalizers/
git commit -m "feat(reporting): add platform normalizers for all 4 platforms"
```

---

## Task 4: Sync Service

**Files:**
- Create: `lib/reporting/sync.ts`

This orchestrates fetching from all connected platforms for a client and upserting into the DB.

**Step 1: Write the sync service**

```typescript
// lib/reporting/sync.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { getNormalizer } from './normalizers';
import type { DateRange, SocialPlatform } from '@/lib/types/reporting';

interface SyncResult {
  synced: boolean;
  platforms: string[];
  postsCount: number;
  errors: string[];
}

export async function syncClientReporting(clientId: string, dateRange: DateRange): Promise<SyncResult> {
  const adminClient = createAdminClient();
  const result: SyncResult = { synced: false, platforms: [], postsCount: 0, errors: [] };

  // Get all active social profiles for this client
  const { data: profiles, error: profilesError } = await adminClient
    .from('social_profiles')
    .select('id, platform, platform_user_id, username, access_token_ref')
    .eq('client_id', clientId)
    .eq('is_active', true);

  if (profilesError || !profiles?.length) {
    result.errors.push(profilesError?.message ?? 'No active social profiles');
    return result;
  }

  for (const profile of profiles) {
    const platform = profile.platform as SocialPlatform;
    const connectionId = profile.access_token_ref;

    if (!connectionId) {
      result.errors.push(`${platform}/${profile.username}: no connection ID`);
      continue;
    }

    try {
      const normalizer = getNormalizer(platform);

      // Fetch insights
      const insights = await normalizer.fetchInsights(connectionId, dateRange);

      // Upsert daily snapshot for today
      const today = new Date().toISOString().split('T')[0];
      await adminClient
        .from('platform_snapshots')
        .upsert({
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          snapshot_date: today,
          followers_count: insights.followers,
          followers_change: insights.followersChange,
          views_count: insights.views,
          engagement_count: insights.engagement,
          engagement_rate: insights.engagementRate,
          posts_count: insights.postsCount,
        }, { onConflict: 'social_profile_id,snapshot_date' });

      // Fetch posts
      const posts = await normalizer.fetchPosts(connectionId, dateRange);

      // Upsert post metrics
      if (posts.length > 0) {
        const postRows = posts.map(p => ({
          social_profile_id: profile.id,
          client_id: clientId,
          platform,
          external_post_id: p.externalPostId,
          post_url: p.postUrl,
          thumbnail_url: p.thumbnailUrl,
          caption: p.caption,
          post_type: p.postType,
          published_at: p.publishedAt,
          views_count: p.views,
          likes_count: p.likes,
          comments_count: p.comments,
          shares_count: p.shares,
          saves_count: p.saves,
          reach_count: p.reach,
          fetched_at: new Date().toISOString(),
        }));

        await adminClient
          .from('post_metrics')
          .upsert(postRows, { onConflict: 'external_post_id,platform' });

        result.postsCount += posts.length;
      }

      result.platforms.push(`${platform}/${profile.username}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`${platform}/${profile.username}: ${msg}`);
      console.error(`[Sync] ${platform}/${profile.username} error:`, error);
    }
  }

  result.synced = result.platforms.length > 0;
  return result;
}
```

**Step 2: Commit**

```bash
git add lib/reporting/sync.ts
git commit -m "feat(reporting): add sync service for cross-platform data"
```

---

## Task 5: API Routes

**Files:**
- Create: `app/api/reporting/sync/route.ts`
- Create: `app/api/reporting/summary/route.ts`
- Create: `app/api/reporting/top-posts/route.ts`

**Step 1: Create sync API route**

```typescript
// app/api/reporting/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncClientReporting } from '@/lib/reporting/sync';
import { z } from 'zod';

const syncSchema = z.object({
  clientId: z.string().uuid(),
  dateRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { clientId, dateRange } = parsed.data;

    // Default to last 7 days if no range provided
    const end = dateRange?.end ?? new Date().toISOString().split('T')[0];
    const start = dateRange?.start ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await syncClientReporting(clientId, { start, end });

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/reporting/sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Create summary API route**

```typescript
// app/api/reporting/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import type { PlatformSummary, SummaryReport } from '@/lib/types/reporting';

const summarySchema = z.object({
  clientId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const parsed = summarySchema.safeParse({
      clientId: url.searchParams.get('clientId'),
      start: url.searchParams.get('start'),
      end: url.searchParams.get('end'),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid params', details: parsed.error.flatten() }, { status: 400 });
    }

    const { clientId, start, end } = parsed.data;
    const adminClient = createAdminClient();

    // Calculate previous period for comparison
    const startDate = new Date(start);
    const endDate = new Date(end);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(startDate.getTime() - daysDiff * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const prevEnd = new Date(startDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch current period snapshots
    const [currentResult, previousResult, profilesResult] = await Promise.all([
      adminClient
        .from('platform_snapshots')
        .select('*')
        .eq('client_id', clientId)
        .gte('snapshot_date', start)
        .lte('snapshot_date', end),
      adminClient
        .from('platform_snapshots')
        .select('*')
        .eq('client_id', clientId)
        .gte('snapshot_date', prevStart)
        .lte('snapshot_date', prevEnd),
      adminClient
        .from('social_profiles')
        .select('id, platform, username, avatar_url')
        .eq('client_id', clientId)
        .eq('is_active', true),
    ]);

    const current = currentResult.data ?? [];
    const previous = previousResult.data ?? [];
    const profiles = profilesResult.data ?? [];

    // Group by platform
    const platformMap = new Map<string, typeof current>();
    const prevPlatformMap = new Map<string, typeof previous>();

    for (const snap of current) {
      const key = snap.platform;
      if (!platformMap.has(key)) platformMap.set(key, []);
      platformMap.get(key)!.push(snap);
    }
    for (const snap of previous) {
      const key = snap.platform;
      if (!prevPlatformMap.has(key)) prevPlatformMap.set(key, []);
      prevPlatformMap.get(key)!.push(snap);
    }

    // Build per-platform summaries
    const platforms: PlatformSummary[] = profiles.map(profile => {
      const snaps = platformMap.get(profile.platform) ?? [];
      const totalViews = snaps.reduce((s, r) => s + (r.views_count ?? 0), 0);
      const totalEngagement = snaps.reduce((s, r) => s + (r.engagement_count ?? 0), 0);
      const latestFollowers = snaps.length > 0
        ? snaps.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0].followers_count ?? 0
        : 0;
      const followerChange = snaps.reduce((s, r) => s + (r.followers_change ?? 0), 0);
      const postsCount = snaps.reduce((s, r) => s + (r.posts_count ?? 0), 0);
      const avgRate = snaps.length > 0
        ? snaps.reduce((s, r) => s + (r.engagement_rate ?? 0), 0) / snaps.length
        : 0;

      return {
        platform: profile.platform,
        username: profile.username,
        avatarUrl: profile.avatar_url,
        followers: latestFollowers,
        followerChange,
        totalViews,
        totalEngagement,
        engagementRate: Math.round(avgRate * 100) / 100,
        postsCount,
      };
    });

    // Build combined totals with change %
    function calcChange(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    const combinedViews = platforms.reduce((s, p) => s + p.totalViews, 0);
    const combinedEngagement = platforms.reduce((s, p) => s + p.totalEngagement, 0);
    const combinedFollowerChange = platforms.reduce((s, p) => s + p.followerChange, 0);
    const combinedAvgRate = platforms.length > 0
      ? platforms.reduce((s, p) => s + p.engagementRate, 0) / platforms.length
      : 0;

    // Previous period totals
    const prevViews = previous.reduce((s, r) => s + (r.views_count ?? 0), 0);
    const prevEngagement = previous.reduce((s, r) => s + (r.engagement_count ?? 0), 0);
    const prevFollowerChange = previous.reduce((s, r) => s + (r.followers_change ?? 0), 0);
    const prevAvgRate = previous.length > 0
      ? previous.reduce((s, r) => s + (r.engagement_rate ?? 0), 0) / previous.length
      : 0;

    const report: SummaryReport = {
      combined: {
        totalViews: combinedViews,
        totalViewsChange: calcChange(combinedViews, prevViews),
        totalFollowerChange: combinedFollowerChange,
        totalFollowerChangeChange: calcChange(combinedFollowerChange, prevFollowerChange),
        totalEngagement: combinedEngagement,
        totalEngagementChange: calcChange(combinedEngagement, prevEngagement),
        avgEngagementRate: Math.round(combinedAvgRate * 100) / 100,
        avgEngagementRateChange: calcChange(combinedAvgRate, prevAvgRate),
      },
      platforms,
      dateRange: { start, end },
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error('GET /api/reporting/summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 3: Create top posts API route**

```typescript
// app/api/reporting/top-posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import type { TopPostItem } from '@/lib/types/reporting';

const topPostsSchema = z.object({
  clientId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.coerce.number().min(1).max(50).default(3),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const parsed = topPostsSchema.safeParse({
      clientId: url.searchParams.get('clientId'),
      start: url.searchParams.get('start'),
      end: url.searchParams.get('end'),
      limit: url.searchParams.get('limit') ?? '3',
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid params', details: parsed.error.flatten() }, { status: 400 });
    }

    const { clientId, start, end, limit } = parsed.data;
    const adminClient = createAdminClient();

    // Fetch posts in date range, ordered by total engagement
    const { data: posts, error } = await adminClient
      .from('post_metrics')
      .select('*, social_profiles!inner(username)')
      .eq('client_id', clientId)
      .gte('published_at', start)
      .lte('published_at', `${end}T23:59:59`)
      .order('likes_count', { ascending: false })
      .limit(limit * 3); // Over-fetch to sort by combined engagement

    if (error) {
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // Sort by total engagement and take top N
    const ranked: TopPostItem[] = (posts ?? [])
      .map(p => ({
        rank: 0,
        id: p.id,
        platform: p.platform,
        username: (p.social_profiles as Record<string, unknown>)?.username as string ?? '',
        externalPostId: p.external_post_id,
        postUrl: p.post_url,
        thumbnailUrl: p.thumbnail_url,
        caption: p.caption,
        postType: p.post_type,
        publishedAt: p.published_at,
        views: p.views_count ?? 0,
        likes: p.likes_count ?? 0,
        comments: p.comments_count ?? 0,
        shares: p.shares_count ?? 0,
        saves: p.saves_count ?? 0,
        totalEngagement: (p.likes_count ?? 0) + (p.comments_count ?? 0) + (p.shares_count ?? 0) + (p.saves_count ?? 0),
      }))
      .sort((a, b) => b.totalEngagement - a.totalEngagement)
      .slice(0, limit)
      .map((p, i) => ({ ...p, rank: i + 1 }));

    return NextResponse.json({ posts: ranked, dateRange: { start, end } });
  } catch (error) {
    console.error('GET /api/reporting/top-posts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 4: Commit**

```bash
git add app/api/reporting/
git commit -m "feat(reporting): add sync, summary, and top-posts API routes"
```

---

## Task 6: Cron Sync Route

**Files:**
- Create: `app/api/cron/sync-reporting/route.ts`
- Modify: `vercel.json` — add cron entry

**Step 1: Create the cron route**

Follow the exact pattern from `app/api/cron/publish-posts/route.ts`:

```typescript
// app/api/cron/sync-reporting/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncClientReporting } from '@/lib/reporting/sync';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Get all active clients with social profiles
    const { data: clients, error } = await adminClient
      .from('clients')
      .select('id, name, social_profiles!inner(id)')
      .eq('is_active', true);

    if (error || !clients?.length) {
      return NextResponse.json({ message: 'No clients to sync', count: 0 });
    }

    // Sync last 7 days for each client
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let successCount = 0;
    let failCount = 0;

    for (const client of clients) {
      try {
        const result = await syncClientReporting(client.id, { start, end });
        if (result.synced) successCount++;
        else failCount++;
        console.log(`[Cron sync] ${client.name}: ${result.platforms.length} platforms, ${result.postsCount} posts`);
      } catch (err) {
        failCount++;
        console.error(`[Cron sync] ${client.name} failed:`, err);
      }
    }

    return NextResponse.json({
      message: `Synced ${successCount} clients, ${failCount} failed`,
      success: successCount,
      failed: failCount,
    });
  } catch (error) {
    console.error('GET /api/cron/sync-reporting error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Update vercel.json**

Add the daily 6 AM UTC cron alongside the existing shoot-planner entry:

```json
{
  "crons": [
    {
      "path": "/api/cron/shoot-planner",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/sync-reporting",
      "schedule": "0 6 * * *"
    }
  ]
}
```

**Step 3: Commit**

```bash
git add app/api/cron/sync-reporting/route.ts vercel.json
git commit -m "feat(reporting): add daily cron sync for social media data"
```

---

## Task 7: Reporting Data Hook

**Files:**
- Create: `components/reporting/hooks/use-reporting-data.ts`

Follow the exact pattern from `components/scheduler/hooks/use-scheduler-data.ts`.

**Step 1: Write the hook**

```typescript
// components/reporting/hooks/use-reporting-data.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { SummaryReport, TopPostItem, DateRangePreset, DateRange } from '@/lib/types/reporting';

function getDateRange(preset: DateRangePreset): DateRange {
  const now = new Date();
  const end = now.toISOString().split('T')[0];

  switch (preset) {
    case '7d': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString().split('T')[0], end };
    }
    case '30d': {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString().split('T')[0], end };
    }
    case 'mtd': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.toISOString().split('T')[0], end };
    }
    case 'ytd': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start: start.toISOString().split('T')[0], end };
    }
    default:
      return { start: end, end };
  }
}

interface ClientOption {
  id: string;
  name: string;
  slug: string;
}

export function useReportingData() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('30d');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [activeView, setActiveView] = useState<'summary' | 'top-posts'>('summary');
  const [topPostsLimit, setTopPostsLimit] = useState(3);

  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [topPosts, setTopPosts] = useState<TopPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const dateRange = datePreset === 'custom' && customRange ? customRange : getDateRange(datePreset);

  // Fetch clients on mount
  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch('/api/clients');
        if (!res.ok) throw new Error('Failed to load clients');
        const data = await res.json();
        const list = (data.clients ?? data ?? []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: c.name as string,
          slug: c.slug as string,
        }));
        setClients(list);
        if (list.length > 0) setSelectedClientId(list[0].id);
      } catch {
        toast.error('Failed to load clients');
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, []);

  // Fetch data when client or date range changes
  const fetchData = useCallback(async () => {
    if (!selectedClientId) return;
    setDataLoading(true);

    try {
      const params = new URLSearchParams({
        clientId: selectedClientId,
        start: dateRange.start,
        end: dateRange.end,
      });

      if (activeView === 'summary') {
        const res = await fetch(`/api/reporting/summary?${params}`);
        if (!res.ok) throw new Error('Failed to load summary');
        const data = await res.json();
        setSummary(data);
      } else {
        params.set('limit', String(topPostsLimit));
        const res = await fetch(`/api/reporting/top-posts?${params}`);
        if (!res.ok) throw new Error('Failed to load top posts');
        const data = await res.json();
        setTopPosts(data.posts ?? []);
      }
    } catch {
      toast.error('Failed to load reporting data');
    } finally {
      setDataLoading(false);
    }
  }, [selectedClientId, dateRange.start, dateRange.end, activeView, topPostsLimit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sync action
  const syncNow = useCallback(async () => {
    if (!selectedClientId) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/reporting/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClientId, dateRange }),
      });
      if (!res.ok) throw new Error('Sync failed');
      const result = await res.json();
      toast.success(`Synced ${result.platforms?.length ?? 0} platforms, ${result.postsCount ?? 0} posts`);
      await fetchData(); // Refresh data after sync
    } catch {
      toast.error('Failed to sync data');
    } finally {
      setSyncing(false);
    }
  }, [selectedClientId, dateRange, fetchData]);

  return {
    clients, selectedClientId, setSelectedClientId,
    datePreset, setDatePreset,
    customRange, setCustomRange,
    dateRange,
    activeView, setActiveView,
    topPostsLimit, setTopPostsLimit,
    summary, topPosts,
    loading, dataLoading, syncing,
    syncNow, refreshData: fetchData,
  };
}
```

**Step 2: Commit**

```bash
git add components/reporting/hooks/use-reporting-data.ts
git commit -m "feat(reporting): add useReportingData hook"
```

---

## Task 8: UI Components — Platform Badge & Date Range Picker

**Files:**
- Create: `components/reporting/platform-badge.tsx`
- Create: `components/reporting/date-range-picker.tsx`

**Step 1: Platform badge**

```typescript
// components/reporting/platform-badge.tsx
'use client';

import { Instagram, Facebook, Youtube } from 'lucide-react';
import type { SocialPlatform } from '@/lib/types/reporting';

const platformConfig: Record<SocialPlatform, { label: string; color: string; bgColor: string; icon: React.ComponentType<{ size?: number }> }> = {
  instagram: { label: 'Instagram', color: 'text-pink-400', bgColor: 'bg-pink-400/10', icon: Instagram },
  facebook: { label: 'Facebook', color: 'text-blue-400', bgColor: 'bg-blue-400/10', icon: Facebook },
  tiktok: { label: 'TikTok', color: 'text-teal-400', bgColor: 'bg-teal-400/10', icon: () => <span className="text-xs font-bold">TT</span> },
  youtube: { label: 'YouTube', color: 'text-red-400', bgColor: 'bg-red-400/10', icon: Youtube },
};

interface PlatformBadgeProps {
  platform: SocialPlatform;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function PlatformBadge({ platform, showLabel = true, size = 'sm' }: PlatformBadgeProps) {
  const config = platformConfig[platform];
  const Icon = config.icon;
  const iconSize = size === 'sm' ? 14 : 18;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${config.bgColor} ${config.color} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      <Icon size={iconSize} />
      {showLabel && config.label}
    </span>
  );
}

export { platformConfig };
```

**Step 2: Date range picker**

```typescript
// components/reporting/date-range-picker.tsx
'use client';

import type { DateRangePreset } from '@/lib/types/reporting';

const presets: { value: DateRangePreset; label: string }[] = [
  { value: '7d', label: 'Past 7 days' },
  { value: '30d', label: 'Past 30 days' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'ytd', label: 'Year to date' },
];

interface DateRangePickerProps {
  value: DateRangePreset;
  onChange: (preset: DateRangePreset) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-surface-hover/50 p-1">
      {presets.map(preset => (
        <button
          key={preset.value}
          onClick={() => onChange(preset.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            value === preset.value
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add components/reporting/platform-badge.tsx components/reporting/date-range-picker.tsx
git commit -m "feat(reporting): add platform badge and date range picker components"
```

---

## Task 9: UI Components — Summary View

**Files:**
- Create: `components/reporting/summary-view.tsx`

Uses existing `StatCard` component. Shows 4 stat cards + platform breakdown table.

**Step 1: Write summary view**

```typescript
// components/reporting/summary-view.tsx
'use client';

import { Eye, UserPlus, Heart, TrendingUp } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './platform-badge';
import type { SummaryReport } from '@/lib/types/reporting';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface SummaryViewProps {
  data: SummaryReport | null;
  loading: boolean;
}

export function SummaryView({ data, loading }: SummaryViewProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="flex items-center justify-center py-16">
        <p className="text-text-muted text-sm">No data available for this period</p>
      </Card>
    );
  }

  const { combined, platforms } = data;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          title="Total views"
          value={formatNumber(combined.totalViews)}
          change={combined.totalViewsChange}
          icon={<Eye size={20} />}
        />
        <StatCard
          title="Followers gained"
          value={formatNumber(combined.totalFollowerChange)}
          change={combined.totalFollowerChangeChange}
          icon={<UserPlus size={20} />}
        />
        <StatCard
          title="Total engagement"
          value={formatNumber(combined.totalEngagement)}
          change={combined.totalEngagementChange}
          icon={<Heart size={20} />}
        />
        <StatCard
          title="Avg engagement rate"
          value={`${combined.avgEngagementRate}%`}
          change={combined.avgEngagementRateChange}
          icon={<TrendingUp size={20} />}
        />
      </div>

      {/* Platform breakdown */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-nativz-border">
          <h3 className="text-sm font-medium text-text-primary">Platform breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nativz-border text-text-muted">
                <th className="text-left px-6 py-3 font-medium">Platform</th>
                <th className="text-right px-4 py-3 font-medium">Followers</th>
                <th className="text-right px-4 py-3 font-medium">Change</th>
                <th className="text-right px-4 py-3 font-medium">Views</th>
                <th className="text-right px-4 py-3 font-medium">Engagement</th>
                <th className="text-right px-6 py-3 font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {platforms.map(p => (
                <tr key={p.platform} className="border-b border-nativz-border/50 hover:bg-surface-hover/30 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={p.platform} showLabel={false} />
                      <span className="text-text-primary font-medium">{p.username}</span>
                    </div>
                  </td>
                  <td className="text-right px-4 py-3 text-text-primary">{formatNumber(p.followers)}</td>
                  <td className="text-right px-4 py-3">
                    <span className={p.followerChange >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {p.followerChange >= 0 ? '+' : ''}{formatNumber(p.followerChange)}
                    </span>
                  </td>
                  <td className="text-right px-4 py-3 text-text-primary">{formatNumber(p.totalViews)}</td>
                  <td className="text-right px-4 py-3 text-text-primary">{formatNumber(p.totalEngagement)}</td>
                  <td className="text-right px-6 py-3 text-text-primary">{p.engagementRate}%</td>
                </tr>
              ))}
              {platforms.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-text-muted">
                    No connected platforms
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/reporting/summary-view.tsx
git commit -m "feat(reporting): add summary view with stat cards and platform table"
```

---

## Task 10: UI Components — Top Posts View

**Files:**
- Create: `components/reporting/top-posts-view.tsx`

**Step 1: Write top posts view**

```typescript
// components/reporting/top-posts-view.tsx
'use client';

import { ExternalLink, Eye, Heart, MessageCircle, Share2, Bookmark } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformBadge } from './platform-badge';
import type { TopPostItem } from '@/lib/types/reporting';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const limitOptions = [3, 5, 10] as const;

interface TopPostsViewProps {
  posts: TopPostItem[];
  loading: boolean;
  limit: number;
  onLimitChange: (limit: number) => void;
}

export function TopPostsView({ posts, loading, limit, onLimitChange }: TopPostsViewProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-1.5">
          {limitOptions.map(n => <Skeleton key={n} className="h-8 w-16 rounded-md" />)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Limit selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Show top</span>
        <div className="flex items-center gap-1 rounded-lg bg-surface-hover/50 p-1">
          {limitOptions.map(n => (
            <button
              key={n}
              onClick={() => onLimitChange(n)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                limit === n
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Post cards */}
      {posts.length === 0 ? (
        <Card className="flex items-center justify-center py-16">
          <p className="text-text-muted text-sm">No posts found for this period</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map(post => (
            <Card
              key={post.id}
              padding="none"
              interactive={!!post.postUrl}
              className="overflow-hidden"
              onClick={() => post.postUrl && window.open(post.postUrl, '_blank')}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-surface-hover">
                {post.thumbnailUrl ? (
                  <img
                    src={post.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-text-muted">
                    <Eye size={32} />
                  </div>
                )}
                {/* Rank badge */}
                <span className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-md">
                  #{post.rank}
                </span>
                {/* Platform badge */}
                <span className="absolute top-2 right-2">
                  <PlatformBadge platform={post.platform} showLabel={false} size="sm" />
                </span>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {/* Caption */}
                <p className="text-sm text-text-secondary line-clamp-2 min-h-[2.5rem]">
                  {post.caption ?? 'No caption'}
                </p>

                {/* Date + link */}
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{formatDate(post.publishedAt)}</span>
                  {post.postUrl && (
                    <ExternalLink size={12} className="text-accent-text" />
                  )}
                </div>

                {/* Engagement metrics */}
                <div className="grid grid-cols-5 gap-1 pt-2 border-t border-nativz-border/50">
                  <MetricPill icon={Eye} value={post.views} label="Views" />
                  <MetricPill icon={Heart} value={post.likes} label="Likes" />
                  <MetricPill icon={MessageCircle} value={post.comments} label="Comments" />
                  <MetricPill icon={Share2} value={post.shares} label="Shares" />
                  <MetricPill icon={Bookmark} value={post.saves} label="Saves" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricPill({ icon: Icon, value, label }: { icon: React.ComponentType<{ size?: number }>; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={label}>
      <Icon size={12} className="text-text-muted" />
      <span className="text-xs font-medium text-text-primary">{formatNumber(value)}</span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/reporting/top-posts-view.tsx
git commit -m "feat(reporting): add top posts view with ranked cards"
```

---

## Task 11: Main Analytics Dashboard Page

**Files:**
- Replace: `app/admin/analytics/page.tsx` (complete rewrite)
- Create: `components/reporting/analytics-dashboard.tsx`

**Step 1: Create the client component**

```typescript
// components/reporting/analytics-dashboard.tsx
'use client';

import { RefreshCw } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from './date-range-picker';
import { SummaryView } from './summary-view';
import { TopPostsView } from './top-posts-view';
import { useReportingData } from './hooks/use-reporting-data';

const viewOptions = [
  { value: 'summary', label: 'Performance summary' },
  { value: 'top-posts', label: 'Top posts' },
] as const;

export function AnalyticsDashboard() {
  const {
    clients, selectedClientId, setSelectedClientId,
    datePreset, setDatePreset,
    activeView, setActiveView,
    topPostsLimit, setTopPostsLimit,
    summary, topPosts,
    loading, dataLoading, syncing,
    syncNow,
  } = useReportingData();

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Select
            options={[
              { value: '', label: 'Select client' },
              ...clients.map(c => ({ value: c.id, label: c.name })),
            ]}
            value={selectedClientId ?? ''}
            onChange={e => setSelectedClientId(e.target.value || null)}
            className="w-48"
          />
          <Button
            variant="ghost"
            onClick={syncNow}
            disabled={syncing || !selectedClientId}
            className="gap-2 text-xs"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync now'}
          </Button>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateRangePicker value={datePreset} onChange={setDatePreset} />

        {/* View toggle */}
        <div className="flex items-center gap-1.5 rounded-lg bg-surface-hover/50 p-1">
          {viewOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setActiveView(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                activeView === opt.value
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {!selectedClientId ? (
        <div className="flex items-center justify-center py-16 text-text-muted text-sm">
          Select a client to view reporting data
        </div>
      ) : activeView === 'summary' ? (
        <SummaryView data={summary} loading={dataLoading} />
      ) : (
        <TopPostsView
          posts={topPosts}
          loading={dataLoading}
          limit={topPostsLimit}
          onLimitChange={setTopPostsLimit}
        />
      )}
    </div>
  );
}
```

**Step 2: Replace the analytics page**

```typescript
// app/admin/analytics/page.tsx
import { AnalyticsDashboard } from '@/components/reporting/analytics-dashboard';

export default function AdminAnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
        <p className="text-sm text-text-muted mt-0.5">Cross-platform social media performance</p>
      </div>
      <AnalyticsDashboard />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add app/admin/analytics/page.tsx components/reporting/analytics-dashboard.tsx
git commit -m "feat(reporting): replace analytics page with unified reporting dashboard"
```

---

## Task 12: Typecheck & Lint

**Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix(reporting): address typecheck and lint issues"
```

---

## Task 13: Update TODO.md

**Files:**
- Modify: `TODO.md`

Add a new EPIC section for social media reporting tracking what was built.

**Step 1: Add the epic to TODO.md**

Add after the last epic:

```markdown
---

## EPIC 7 — Social Media Reporting Dashboard

**Goal:** Unified cross-platform reporting — aggregate Instagram, TikTok, Facebook, and YouTube Shorts metrics into one dashboard with cumulative summaries and top post discovery. Replaces old analytics page.

- [x] **DB migration: create `platform_snapshots` and `post_metrics` tables** — Daily aggregate snapshots + per-post performance. Migration `021_create_reporting_tables.sql`.
- [x] **TypeScript types** — `lib/types/reporting.ts` with normalized shapes for all platforms.
- [x] **Platform normalizers** — `lib/reporting/normalizers/` with Instagram, Facebook, TikTok, YouTube normalizers mapping to unified schema via Nango proxy.
- [x] **Sync service** — `lib/reporting/sync.ts` orchestrates fetching from all connected platforms and upserting to DB.
- [x] **API routes** — `POST /api/reporting/sync`, `GET /api/reporting/summary`, `GET /api/reporting/top-posts`. All with Zod validation + auth.
- [x] **Cron sync** — `GET /api/cron/sync-reporting` runs daily at 6 AM UTC via Vercel cron.
- [x] **Analytics dashboard** — Replaced `/admin/analytics` with unified reporting. Client selector, date range presets (7d/30d/MTD/YTD), pill-toggled views.
- [x] **Performance summary view** — 4 StatCards (views, followers gained, engagement, avg rate) with period-over-period change. Platform breakdown table.
- [x] **Top posts view** — Ranked post cards (top 3/5/10) with thumbnail, caption, engagement breakdown. Click to open original post.
- [x] **Sync now button** — Manual data refresh from the dashboard.
```

**Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: add EPIC 7 social media reporting to TODO.md"
```
