import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAffiliateAnalyticsRange } from '@/lib/affiliates/fetch-affiliate-analytics-range';

/**
 * GET /api/clients/[id]/analytics/summary
 *
 * Rollup for the client Overview page. One call; tiles render in parallel
 * with no further round-trips. Sections:
 *   - social       connected platforms + posts/30d
 *   - affiliate    30d revenue/referrals (if UpPromote connected)
 *   - benchmarking followers + delta + competitor count
 *   - paidMedia    null until backend lands
 *   - pipeline     ideas awaiting / scheduled in 14d / days since last post
 *   - activity     last 5 events (ideas, posts, searches)
 *
 * Auth: admin sees all; viewer must have user_client_access for the client.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: me } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = me?.role === 'admin';
    if (!isAdmin) {
      const { data: access } = await admin
        .from('user_client_access')
        .select('client_id')
        .eq('user_id', user.id)
        .eq('client_id', clientId)
        .maybeSingle();
      if (!access) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: client } = await admin
      .from('clients')
      .select('id, uppromote_api_key')
      .eq('id', clientId)
      .single();
    if (!client) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const hasAffiliate = Boolean((client as { uppromote_api_key?: string | null }).uppromote_api_key);
    const now = new Date();
    const thirtyDaysAgo = iso(now, -30);
    const fourteenDaysFromNow = iso(now, 14);

    const [
      socialRes,
      postsPublishedRes,
      postsScheduledRes,
      lastPostRes,
      benchmarksRes,
      benchSnapshotsRes,
      ideasWaitingRes,
      recentIdeasRes,
      recentPostsRes,
      recentSearchesRes,
    ] = await Promise.all([
      admin
        .from('social_profiles')
        .select('platform, username')
        .eq('client_id', clientId)
        .eq('is_active', true),

      admin
        .from('scheduled_posts')
        .select('id', { count: 'exact', head: false })
        .eq('client_id', clientId)
        .eq('status', 'published')
        .gte('published_at', thirtyDaysAgo)
        .limit(1000),

      admin
        .from('scheduled_posts')
        .select('id, scheduled_at')
        .eq('client_id', clientId)
        .eq('status', 'scheduled')
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', fourteenDaysFromNow),

      admin
        .from('scheduled_posts')
        .select('published_at')
        .eq('client_id', clientId)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      admin
        .from('client_benchmarks')
        .select('id, competitors_snapshot')
        .eq('client_id', clientId)
        .eq('is_active', true),

      admin
        .from('benchmark_snapshots')
        .select('benchmark_id, followers, followers_delta, captured_at')
        .gte('captured_at', thirtyDaysAgo)
        .order('captured_at', { ascending: false })
        .limit(500),

      admin
        .from('idea_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'new'),

      admin
        .from('idea_submissions')
        .select('id, title, status, created_at, submitted_by')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(5),

      admin
        .from('scheduled_posts')
        .select('id, caption, status, published_at, scheduled_at, updated_at')
        .eq('client_id', clientId)
        .order('updated_at', { ascending: false })
        .limit(5),

      admin
        .from('topic_searches')
        .select('id, query, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const social = summarizeSocial(socialRes.data ?? [], postsPublishedRes.count ?? 0);
    const benchmarking = summarizeBenchmarking(
      benchmarksRes.data ?? [],
      benchSnapshotsRes.data ?? [],
    );

    let affiliate: AffiliateSummary;
    if (hasAffiliate) {
      try {
        const payload = await fetchAffiliateAnalyticsRange(
          admin,
          clientId,
          thirtyDaysAgo.slice(0, 10),
          now.toISOString().slice(0, 10),
        );
        affiliate = {
          hasIntegration: true,
          revenue: payload.kpis.periodRevenue,
          referrals: payload.kpis.referralsInPeriod,
          activeAffiliates: payload.kpis.activeAffiliates,
          commission: payload.kpis.periodCommission,
        };
      } catch {
        affiliate = { hasIntegration: true, revenue: 0, referrals: 0, activeAffiliates: 0, commission: 0, error: true };
      }
    } else {
      affiliate = { hasIntegration: false };
    }

    const pipeline = buildPipeline({
      ideasWaiting: ideasWaitingRes.count ?? 0,
      scheduled14d: postsScheduledRes.data?.length ?? 0,
      lastPublishedAt: lastPostRes.data?.published_at ?? null,
    });

    const activity = buildActivity({
      ideas: recentIdeasRes.data ?? [],
      posts: recentPostsRes.data ?? [],
      searches: recentSearchesRes.data ?? [],
    });

    return NextResponse.json({
      generatedAt: now.toISOString(),
      social,
      affiliate,
      benchmarking,
      paidMedia: null,
      pipeline,
      activity,
    });
  } catch (err) {
    console.error('[analytics/summary] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── shapes ───────────────────────────────────────────────────────────────────

type SocialSummary = {
  connectedPlatforms: number;
  platforms: { platform: string; username: string }[];
  postsLast30Days: number;
};

type BenchmarkingSummary = {
  activeBenchmarks: number;
  competitorsTracked: number;
  followersLatest: number | null;
  followersDelta30d: number | null;
};

type AffiliateSummary =
  | { hasIntegration: false }
  | { hasIntegration: true; revenue: number; referrals: number; activeAffiliates: number; commission: number; error?: boolean };

type PipelineSummary = {
  ideasWaiting: number;
  scheduledNext14d: number;
  daysSinceLastPost: number | null;
  lastPostIso: string | null;
};

type ActivityItem = {
  id: string;
  kind: 'idea_submitted' | 'post_published' | 'post_scheduled' | 'search_completed' | 'search_started';
  at: string;
  label: string;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function iso(base: Date, daysOffset: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

function summarizeSocial(
  profiles: Array<{ platform: string; username: string }>,
  postsLast30Days: number,
): SocialSummary {
  return {
    connectedPlatforms: profiles.length,
    platforms: profiles.map((p) => ({ platform: p.platform, username: p.username })),
    postsLast30Days,
  };
}

function summarizeBenchmarking(
  benchmarks: Array<{ id: string; competitors_snapshot: unknown }>,
  snapshots: Array<{ benchmark_id: string; followers: number | null; followers_delta: number | null; captured_at: string }>,
): BenchmarkingSummary {
  const activeBenchmarks = benchmarks.length;
  const competitorsTracked = benchmarks.reduce((sum, b) => {
    const arr = Array.isArray(b.competitors_snapshot) ? b.competitors_snapshot : [];
    return sum + arr.length;
  }, 0);
  if (activeBenchmarks === 0 || snapshots.length === 0) {
    return { activeBenchmarks, competitorsTracked, followersLatest: null, followersDelta30d: null };
  }
  const latest = new Map<string, { followers: number | null; followers_delta: number | null }>();
  for (const s of snapshots) {
    if (!latest.has(s.benchmark_id)) latest.set(s.benchmark_id, { followers: s.followers, followers_delta: s.followers_delta });
  }
  let total = 0;
  let delta = 0;
  let had = false;
  for (const v of latest.values()) {
    if (v.followers != null) { total += v.followers; had = true; }
    if (v.followers_delta != null) delta += v.followers_delta;
  }
  return {
    activeBenchmarks,
    competitorsTracked,
    followersLatest: had ? total : null,
    followersDelta30d: had ? delta : null,
  };
}

function buildPipeline({
  ideasWaiting,
  scheduled14d,
  lastPublishedAt,
}: {
  ideasWaiting: number;
  scheduled14d: number;
  lastPublishedAt: string | null;
}): PipelineSummary {
  let daysSinceLastPost: number | null = null;
  if (lastPublishedAt) {
    const diffMs = Date.now() - new Date(lastPublishedAt).getTime();
    daysSinceLastPost = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }
  return {
    ideasWaiting,
    scheduledNext14d: scheduled14d,
    daysSinceLastPost,
    lastPostIso: lastPublishedAt,
  };
}

function buildActivity({
  ideas,
  posts,
  searches,
}: {
  ideas: Array<{ id: string; title: string | null; status: string; created_at: string }>;
  posts: Array<{ id: string; caption: string | null; status: string; published_at: string | null; scheduled_at: string | null; updated_at: string }>;
  searches: Array<{ id: string; query: string | null; status: string; created_at: string }>;
}): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const i of ideas) {
    items.push({
      id: `idea-${i.id}`,
      kind: 'idea_submitted',
      at: i.created_at,
      label: i.title ?? 'Idea submitted',
    });
  }
  for (const p of posts) {
    if (p.status === 'published' && p.published_at) {
      items.push({
        id: `post-pub-${p.id}`,
        kind: 'post_published',
        at: p.published_at,
        label: truncate(p.caption ?? 'Post published', 72),
      });
    } else if (p.status === 'scheduled' && p.scheduled_at) {
      items.push({
        id: `post-sch-${p.id}`,
        kind: 'post_scheduled',
        at: p.updated_at,
        label: truncate(p.caption ?? 'Post scheduled', 72),
      });
    }
  }
  for (const s of searches) {
    items.push({
      id: `search-${s.id}`,
      kind: s.status === 'completed' ? 'search_completed' : 'search_started',
      at: s.created_at,
      label: s.query ?? 'Topic search',
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items.slice(0, 5);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
