import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_PILLAR_DESC = 280;
const MAX_TOPIC_QUERIES = 5;
const TONE_SNIPPET = 360;
const MAX_TOP_POSTS = 2;
const MAX_PACK_CHARS = 5000;

type PillarRow = { name: string; description: string | null; sort_order: number };
type TopicSearchRow = { query: string; status: string; created_at: string };
type SnapshotRow = {
  views_count: number | null;
  engagement_count: number | null;
  followers_change: number | null;
  social_profiles: Array<{ platform: string | null; username: string | null }> | null;
};
type TopPostRow = {
  caption: string | null;
  views_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  saves_count: number | null;
  platform: string | null;
  post_url: string | null;
};
type AffiliateMemberRow = { pending_amount: number | null };
type AffiliateReferralRow = { total_sales: number | null; commission: number | null };

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function truncateContentLabContextPack(text: string, maxChars = MAX_PACK_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const marker = '\n\n[truncated for token budget]';
  return `${trimmed.slice(0, Math.max(0, maxChars - marker.length)).trimEnd()}${marker}`;
}

function buildPillarsBlock(pillars: PillarRow[]): string[] {
  if (pillars.length === 0) {
    return ['**Content pillars:** none yet — run pillar strategy from the Ideas hub or Strategy Lab.'];
  }

  return [
    `**Content pillars (${pillars.length})**`,
    ...pillars.map((p) => {
      const desc = p.description?.trim();
      return `- ${p.name}${desc ? `: ${truncate(desc, MAX_PILLAR_DESC)}` : ''}`;
    }),
  ];
}

function buildTopicSearchesBlock(searches: TopicSearchRow[]): string[] {
  const completed = searches.filter((s) => s.status === 'completed').slice(0, MAX_TOPIC_QUERIES);
  if (completed.length === 0) return [];
  return [
    `**Recent topic searches (completed, ${completed.length} shown)**`,
    ...completed.map((s) => `- ${s.query}`),
  ];
}

function buildPerformanceBlock(snapshots: SnapshotRow[]): string[] {
  if (snapshots.length === 0) return [];

  const totalViews = snapshots.reduce((sum, s) => sum + (s.views_count ?? 0), 0);
  const totalEngagement = snapshots.reduce((sum, s) => sum + (s.engagement_count ?? 0), 0);
  const totalFollowerChange = snapshots.reduce((sum, s) => sum + (s.followers_change ?? 0), 0);

  const platformViews = new Map<string, number>();
  for (const row of snapshots) {
    const platform = row.social_profiles?.[0]?.platform?.trim() || 'unknown';
    platformViews.set(platform, (platformViews.get(platform) ?? 0) + (row.views_count ?? 0));
  }

  const strongestPlatform =
    [...platformViews.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const line = [
    `**Performance snapshot (last 7d):** ${formatCompactNumber(totalViews)} views`,
    `${formatCompactNumber(totalEngagement)} engagement`,
    `${totalFollowerChange >= 0 ? '+' : ''}${formatCompactNumber(totalFollowerChange)} followers`,
    strongestPlatform && strongestPlatform !== 'unknown'
      ? `strongest platform by views: ${strongestPlatform}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return [line];
}

function buildTopPostsBlock(posts: TopPostRow[]): string[] {
  const ranked = posts
    .map((post) => {
      const engagement =
        (post.likes_count ?? 0) +
        (post.comments_count ?? 0) +
        (post.shares_count ?? 0) +
        (post.saves_count ?? 0);
      return { ...post, engagement };
    })
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, MAX_TOP_POSTS);

  if (ranked.length === 0) return [];

  return [
    `**Top recent posts (30d, top ${ranked.length})**`,
    ...ranked.map((post) => {
      const caption = post.caption?.trim() ? truncate(post.caption, 90) : 'Untitled post';
      const platform = post.platform?.trim() || 'unknown';
      return `- ${platform}: "${caption}" · ${formatCompactNumber(post.engagement)} engagement · ${formatCompactNumber(post.views_count ?? 0)} views`;
    }),
  ];
}

function buildAffiliateBlock(params: {
  hasIntegration: boolean;
  activeAffiliates: number;
  periodRevenue: number;
  periodReferrals: number;
  totalPending: number;
}): string[] {
  if (!params.hasIntegration) return [];

  return [
    `**Affiliate snapshot (30d):** ${params.activeAffiliates} active affiliates · ${params.periodReferrals} referrals · ${formatCompactNumber(params.periodRevenue)} revenue${params.totalPending > 0 ? ` · ${formatCompactNumber(params.totalPending)} pending payouts` : ''}`,
    'Use affiliate tools for detail: get_affiliate_summary, list_affiliates, get_affiliate_referrals.',
  ];
}

/**
 * Compact, deterministic “Strategy Lab” snapshot for Nerd when a client is @mentioned.
 * Appended to portfolio context (admin) — keep reasonably small for token budget.
 */
export async function buildContentLabContextPack(
  admin: SupabaseClient,
  clientId: string,
): Promise<string> {
  try {
    const parts: string[] = ['### Strategy Lab snapshot (live)'];

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDayStart = sevenDaysAgo.toISOString().split('T')[0];
    const thirtyDayStart = thirtyDaysAgo.toISOString().split('T')[0];
    const todayDate = today.toISOString().split('T')[0];
    const thirtyDayStartTs = `${thirtyDayStart}T00:00:00Z`;
    const todayEndTs = `${todayDate}T23:59:59Z`;

    const [
      { data: pillars },
      { data: searches },
      { data: bg },
      { count: ideaGenCount },
      { data: snapshots },
      { data: topPosts },
      { data: clientRow },
      { count: activeAffiliates },
      { data: affiliateReferrals },
      { data: pendingMembers },
    ] = await Promise.all([
      admin
        .from('content_pillars')
        .select('name, description, sort_order')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true }),
      admin
        .from('topic_searches')
        .select('query, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(12),
      admin
        .from('client_knowledge_entries')
        .select('metadata')
        .eq('client_id', clientId)
        .eq('type', 'brand_guideline')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('idea_generations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'completed'),
      admin
        .from('platform_snapshots')
        .select('views_count, engagement_count, followers_change, social_profiles!inner(platform, username)')
        .eq('client_id', clientId)
        .gte('snapshot_date', sevenDayStart)
        .lte('snapshot_date', todayDate),
      admin
        .from('post_metrics')
        .select('caption, views_count, likes_count, comments_count, shares_count, saves_count, platform, post_url')
        .eq('client_id', clientId)
        .gte('published_at', thirtyDayStart)
        .lte('published_at', todayDate),
      admin
        .from('clients')
        .select('uppromote_api_key')
        .eq('id', clientId)
        .maybeSingle(),
      admin
        .from('affiliate_members')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'active'),
      admin
        .from('affiliate_referrals')
        .select('total_sales, commission')
        .eq('client_id', clientId)
        .gte('created_at_upstream', thirtyDayStartTs)
        .lte('created_at_upstream', todayEndTs),
      admin
        .from('affiliate_members')
        .select('pending_amount')
        .eq('client_id', clientId)
        .gt('pending_amount', 0),
    ]);

    const pillarRows = (pillars ?? []) as PillarRow[];
    const searchRows = (searches ?? []) as TopicSearchRow[];
    const snapshotRows = (snapshots ?? []) as unknown as SnapshotRow[];
    const topPostRows = (topPosts ?? []) as TopPostRow[];
    const affiliateReferralRows = (affiliateReferrals ?? []) as AffiliateReferralRow[];
    const pendingMemberRows = (pendingMembers ?? []) as AffiliateMemberRow[];

    parts.push(...buildPillarsBlock(pillarRows));
    parts.push(...buildTopicSearchesBlock(searchRows));
    parts.push(...buildPerformanceBlock(snapshotRows));
    parts.push(...buildTopPostsBlock(topPostRows));

    const meta = (bg?.metadata as Record<string, unknown> | null) ?? null;
    const tone = typeof meta?.tone_primary === 'string' ? meta.tone_primary.trim() : '';
    if (tone) {
      parts.push(
        `**Brand DNA tone (snippet):** ${truncate(tone, TONE_SNIPPET)}`,
      );
    }

    if (ideaGenCount != null && ideaGenCount > 0) {
      parts.push(`**Completed idea generations (count):** ${ideaGenCount}`);
    }

    const hasAffiliateIntegration = Boolean(
      (clientRow as { uppromote_api_key?: string | null } | null)?.uppromote_api_key,
    );
    const periodRevenue = affiliateReferralRows.reduce((sum, r) => sum + (Number(r.total_sales) || 0), 0);
    const periodReferrals = affiliateReferralRows.length;
    const totalPending = pendingMemberRows.reduce((sum, row) => sum + (Number(row.pending_amount) || 0), 0);
    parts.push(
      ...buildAffiliateBlock({
        hasIntegration: hasAffiliateIntegration,
        activeAffiliates: activeAffiliates ?? 0,
        periodRevenue,
        periodReferrals,
        totalPending,
      }),
    );

    parts.push(
      'Use tools for live metrics (e.g. get_client_analytics, search_knowledge_base) — this block is a static snapshot.',
    );

    return truncateContentLabContextPack(parts.join('\n'));
  } catch {
    return '';
  }
}
