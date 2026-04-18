/**
 * Nerd tools for the Strategy Lab + per-analysis drawer.
 *
 * These are the "hands" the brain (Nerd) calls when it needs detail on
 * an analysis the user attached to the chat session via scopeContext.
 * Instead of dumping every audit / TikTok-Shop search / topic search
 * blob into the system prompt, the route injects only a compact index;
 * the agent reaches for these tools when the user's question calls for
 * specifics. Keeps one session lean even with 5+ analyses attached.
 */

import { z } from 'zod';
import { ToolDefinition } from '../types';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CreatorEnrichment, RankedCreator, SearchResults } from '@/lib/tiktok-shop/types';

// ---------------------------------------------------------------------------
// Organic Social audits (prospect_audits)
// ---------------------------------------------------------------------------

interface WebsiteContext {
  title?: string | null;
  industry?: string | null;
  audience?: string | null;
  brand_voice?: string | null;
  positioning?: string | null;
  topics?: string[] | null;
}

interface ProspectData {
  websiteContext?: WebsiteContext | null;
  platforms?: Array<{
    platform: string;
    profile?: {
      username?: string | null;
      displayName?: string | null;
      followers?: number | null;
      following?: number | null;
      bio?: string | null;
      profileUrl?: string | null;
    } | null;
    videos?: Array<{
      description?: string | null;
      views?: number | null;
      likes?: number | null;
      comments?: number | null;
      url?: string | null;
      publishDate?: string | null;
    }> | null;
  }> | null;
}

interface ScorecardPillar {
  pillar?: string;
  score?: number;
  headline?: string;
  findings?: string[];
  recommendations?: string[];
}

interface AuditRow {
  id: string;
  status: string;
  website_url: string | null;
  prospect_data: ProspectData | null;
  competitors_data: unknown;
  scorecard: { pillars?: ScorecardPillar[]; summary?: string } | null;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
}

function summarizeAudit(audit: AuditRow): string {
  const lines: string[] = [];
  const pd = audit.prospect_data ?? {};
  const ctx = pd.websiteContext ?? {};
  const label = ctx.title?.trim() || audit.website_url || 'unknown';
  lines.push(`**${label}** · status: ${audit.status}`);
  if (audit.website_url) lines.push(`Website: ${audit.website_url}`);
  if (ctx.industry) lines.push(`Industry: ${ctx.industry}`);
  if (ctx.audience) lines.push(`Audience: ${ctx.audience}`);
  if (ctx.brand_voice) lines.push(`Brand voice: ${ctx.brand_voice}`);

  const platforms = pd.platforms ?? [];
  if (platforms.length > 0) {
    const rows = platforms
      .filter((p) => p.profile)
      .map((p) => {
        const prof = p.profile!;
        const followers = prof.followers ? formatCompact(prof.followers) : '—';
        return `- ${p.platform}: @${prof.username ?? 'unknown'} · ${followers} followers · ${p.videos?.length ?? 0} videos`;
      });
    if (rows.length > 0) {
      lines.push(`\nPlatforms:\n${rows.join('\n')}`);
    }
  }

  const scorecard = audit.scorecard;
  if (scorecard?.pillars && scorecard.pillars.length > 0) {
    const pillars = scorecard.pillars.slice(0, 6).map((p) => {
      return `- **${p.pillar}** (${p.score ?? '—'}/100): ${p.headline ?? ''}`;
    });
    lines.push(`\nScorecard pillars:\n${pillars.join('\n')}`);
  }
  if (scorecard?.summary) {
    lines.push(`\nSummary: ${scorecard.summary.slice(0, 500)}${scorecard.summary.length > 500 ? '…' : ''}`);
  }

  return lines.join('\n');
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const getAuditSummary: ToolDefinition = {
  name: 'get_audit_summary',
  description:
    'Fetch a compact digest of an Organic Social audit (prospect_audits row). Use this when the user asks about an attached audit in general terms — returns the brand profile, platform rollups, and scorecard headlines. For specifics (a particular video, a particular competitor), call search_audit_findings instead.',
  parameters: z.object({
    audit_id: z.string().uuid(),
  }),
  riskLevel: 'read',
  handler: async (params) => {
    const supabase = createAdminClient();
    const auditId = params.audit_id as string;
    const { data, error } = await supabase
      .from('prospect_audits')
      .select('id, status, website_url, prospect_data, competitors_data, scorecard, error_message, created_at, updated_at')
      .eq('id', auditId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Audit not found' };

    const summary = summarizeAudit(data as AuditRow);
    return {
      success: true,
      data: {
        id: data.id,
        status: data.status,
        summary_markdown: summary,
      },
      link: {
        href: `/admin/analyze-social/${data.id}`,
        label: 'Open audit',
      },
    };
  },
};

const searchAuditFindings: ToolDefinition = {
  name: 'search_audit_findings',
  description:
    'Search within a single Organic Social audit for videos, competitors, or scorecard findings matching a free-text query. Use this when the user asks a specific question about an audit (e.g. "what was their best-performing video about?"). Returns up to 10 matches ranked by simple substring relevance.',
  parameters: z.object({
    audit_id: z.string().uuid(),
    query: z.string().min(2),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  riskLevel: 'read',
  handler: async (params) => {
    const supabase = createAdminClient();
    const auditId = params.audit_id as string;
    const query = (params.query as string).toLowerCase();
    const limit = (params.limit as number) ?? 10;

    const { data, error } = await supabase
      .from('prospect_audits')
      .select('id, prospect_data, competitors_data, scorecard')
      .eq('id', auditId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Audit not found' };

    type Hit = { kind: 'video' | 'competitor' | 'finding'; score: number; text: string; meta?: Record<string, unknown> };
    const hits: Hit[] = [];

    const pd = (data.prospect_data ?? {}) as ProspectData;
    for (const p of pd.platforms ?? []) {
      for (const v of p.videos ?? []) {
        const text = (v.description ?? '').toLowerCase();
        if (text.includes(query)) {
          hits.push({
            kind: 'video',
            score: text.split(query).length - 1,
            text: v.description ?? '',
            meta: {
              platform: p.platform,
              url: v.url,
              views: v.views ?? null,
              likes: v.likes ?? null,
              publishDate: v.publishDate ?? null,
            },
          });
        }
      }
    }

    const competitors = Array.isArray(data.competitors_data) ? (data.competitors_data as Array<Record<string, unknown>>) : [];
    for (const c of competitors) {
      const name = String(c?.name ?? c?.handle ?? '');
      const notes = String(c?.analysis ?? c?.summary ?? c?.notes ?? '');
      const hay = `${name} ${notes}`.toLowerCase();
      if (hay.includes(query)) {
        hits.push({
          kind: 'competitor',
          score: hay.split(query).length - 1,
          text: `${name}${notes ? ` — ${notes}` : ''}`,
          meta: c,
        });
      }
    }

    const scorecard = data.scorecard as { pillars?: ScorecardPillar[] } | null;
    for (const pillar of scorecard?.pillars ?? []) {
      for (const finding of pillar.findings ?? []) {
        if (finding.toLowerCase().includes(query)) {
          hits.push({
            kind: 'finding',
            score: finding.toLowerCase().split(query).length - 1,
            text: finding,
            meta: { pillar: pillar.pillar, score: pillar.score },
          });
        }
      }
      for (const rec of pillar.recommendations ?? []) {
        if (rec.toLowerCase().includes(query)) {
          hits.push({
            kind: 'finding',
            score: rec.toLowerCase().split(query).length - 1,
            text: rec,
            meta: { pillar: pillar.pillar, kind: 'recommendation' },
          });
        }
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return {
      success: true,
      data: {
        audit_id: auditId,
        query: params.query,
        hits: hits.slice(0, limit),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// TikTok Shop searches
// ---------------------------------------------------------------------------

interface TtShopSearchRow {
  id: string;
  query: string;
  status: string;
  products_found: number;
  creators_found: number;
  creators_enriched: number;
  market_country_code: string;
  results: SearchResults | null;
  created_at: string;
  completed_at: string | null;
}

const getTiktokShopSearchSummary: ToolDefinition = {
  name: 'get_tiktok_shop_search_summary',
  description:
    'Fetch a compact digest of a TikTok Shop category search: top products, top-10 creators by composite score with account-type + traffic/e-com indices, plus regional GMV benchmark context. Use this when the user asks about an attached TikTok Shop search in general terms. For a specific creator\'s full stats, call get_tiktok_shop_creator_details with their username.',
  parameters: z.object({
    search_id: z.string().uuid(),
    top_creators: z.number().int().min(1).max(30).default(10),
  }),
  riskLevel: 'read',
  handler: async (params) => {
    const supabase = createAdminClient();
    const searchId = params.search_id as string;
    const topN = (params.top_creators as number) ?? 10;

    const { data, error } = await supabase
      .from('tiktok_shop_searches')
      .select('id, query, status, products_found, creators_found, creators_enriched, market_country_code, results, created_at, completed_at')
      .eq('id', searchId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'TikTok Shop search not found' };

    const row = data as TtShopSearchRow;
    const results = row.results;
    const creators = (results?.creators ?? []).slice(0, topN);
    const products = (results?.products ?? []).slice(0, 10);

    const creatorLines = creators.map((c: RankedCreator, i: number) => {
      const follow = formatCompact(c.followers);
      const gmv = c.stats?.gmv.total ? `$${formatCompact(c.stats.gmv.total)} GMV` : 'GMV n/a';
      const cat = c.categories[0] ? ` · ${c.categories[0]}` : '';
      return `${i + 1}. @${c.username}${cat} · ${follow} followers · ${gmv} · Traffic ${c.trafficIndex}/100 · E-com ${c.ecommercePotentialIndex}/100 · [${c.accountType}]`;
    });

    const productLines = products.map((p, i: number) => {
      return `${i + 1}. ${p.name} · ${p.priceDisplay ?? (p.price != null ? `$${p.price}` : '—')} · ${p.salesCount ?? 0} sales · ${p.affiliates.length} affiliates`;
    });

    const benchmark = results?.primaryBenchmark;
    const benchmarkLine = benchmark
      ? `**${benchmark.category} drives ${Math.round(benchmark.gmvShare * 100)}% of ${benchmark.countryCode} TikTok Shop GMV${benchmark.note ? ` — ${benchmark.note}` : ''}.**`
      : null;

    return {
      success: true,
      data: {
        id: row.id,
        query: row.query,
        status: row.status,
        country: row.market_country_code,
        products_found: row.products_found,
        creators_found: row.creators_found,
        summary_markdown: [
          `## TikTok Shop search: "${row.query}" (${row.market_country_code})`,
          benchmarkLine,
          productLines.length > 0 ? `\n### Top products\n${productLines.join('\n')}` : null,
          creatorLines.length > 0 ? `\n### Top ${creatorLines.length} creators (ranked)\n${creatorLines.join('\n')}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
      link: {
        href: `/admin/competitor-tracking/tiktok-shop/${row.id}`,
        label: 'Open search',
      },
    };
  },
};

const getTiktokShopCreatorDetails: ToolDefinition = {
  name: 'get_tiktok_shop_creator_details',
  description:
    'Fetch the full cached enrichment for a TikTok Shop creator by username (lemur snapshot): profile, GMV breakdown by video/live, engagement rates, demographics, category IDs, brand collabs. Use when the user wants to dig into one specific creator. If no cached snapshot exists, returns not_found — suggest the user open the creator page to fetch fresh.',
  parameters: z.object({
    username: z.string().min(1),
  }),
  riskLevel: 'read',
  handler: async (params) => {
    const supabase = createAdminClient();
    const handle = (params.username as string).replace(/^@/, '').trim().toLowerCase();
    const { data, error } = await supabase
      .from('tiktok_shop_creator_snapshots')
      .select('username, data, fetched_at')
      .eq('username', handle)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) {
      return {
        success: true,
        data: { not_found: true, username: handle },
      };
    }

    const creator = data.data as CreatorEnrichment;
    const s = creator.stats;
    const summary = [
      `## @${creator.username}${creator.nickname ? ` (${creator.nickname})` : ''}`,
      creator.region ? `Region: ${creator.region}` : null,
      creator.bio ? `Bio: ${creator.bio}` : null,
      '',
      `**GMV** · Total $${formatCompact(s.gmv.total)} · Video $${formatCompact(s.gmv.video)} · Live $${formatCompact(s.gmv.live)}`,
      `**Units sold (30d)** · ${formatCompact(s.unitsSold30d)}`,
      `**GPM** · $${s.gpm.toFixed(2)}`,
      `**Performance score** · ${s.performanceScore}/100`,
      `**Brand collabs** · ${s.brandCollabs}`,
      `**Promoted products** · ${s.promotedProducts}`,
      '',
      `**Engagement · video** · ${(s.engagementRate.video * (s.engagementRate.video > 1 ? 1 : 100)).toFixed(2)}%`,
      `**Engagement · live** · ${(s.engagementRate.live * (s.engagementRate.live > 1 ? 1 : 100)).toFixed(2)}%`,
      `**Avg views · video** · ${formatCompact(s.avgViews.video)}`,
      `**Posts (30d)** · ${s.contentFrequency.video} videos, ${s.contentFrequency.live} lives`,
      '',
      s.demographics.age.length > 0
        ? `Top age groups: ${s.demographics.age.slice(0, 3).map((d) => `${d.label} (${d.pct > 1 ? d.pct : (d.pct * 100).toFixed(0)}%)`).join(', ')}`
        : null,
      s.demographics.gender.length > 0
        ? `Gender: ${s.demographics.gender.map((d) => `${d.label} ${d.pct > 1 ? d.pct : (d.pct * 100).toFixed(0)}%`).join(' / ')}`
        : null,
      s.demographics.location.length > 0
        ? `Top locations: ${s.demographics.location.slice(0, 3).map((d) => d.label).join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      success: true,
      data: {
        username: handle,
        fetched_at: data.fetched_at,
        summary_markdown: summary,
        raw: creator,
      },
      link: {
        href: `/admin/competitor-tracking/tiktok-shop/creator/${encodeURIComponent(handle)}`,
        label: 'Open creator',
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Topic search summary — compact counterpart to the existing
// `get_search_results` tool (which returns the raw row). This one
// produces a model-friendly markdown digest for Strategy Lab chats.
// ---------------------------------------------------------------------------

interface TopicSearchRow {
  id: string;
  query: string;
  status: string;
  summary: string | null;
  metrics: Record<string, unknown> | null;
  trending_topics: Array<{ name: string; resonance?: string; sentiment?: number; video_ideas?: Array<{ title: string; hook?: string }> }> | null;
  platforms: string[] | null;
  volume: string | null;
  search_mode: string | null;
  created_at: string;
}

const getTopicSearchSummary: ToolDefinition = {
  name: 'get_topic_search_summary',
  description:
    'Fetch a compact, markdown-formatted digest of a topic search — query, summary, key metrics, and the top trending topics with their video ideas. Prefer this over get_search_results when you want a readable summary to reason over; use get_search_results when you need the raw structured payload.',
  parameters: z.object({
    search_id: z.string().uuid(),
  }),
  riskLevel: 'read',
  handler: async (params) => {
    const supabase = createAdminClient();
    const searchId = params.search_id as string;
    const { data, error } = await supabase
      .from('topic_searches')
      .select('id, query, status, summary, metrics, trending_topics, platforms, volume, search_mode, created_at')
      .eq('id', searchId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: 'Topic search not found' };

    const row = data as TopicSearchRow;
    const lines: string[] = [`## Topic search: "${row.query}" (${row.status})`];
    if (row.search_mode) lines.push(`Mode: ${row.search_mode}`);
    if (row.platforms && row.platforms.length > 0) lines.push(`Platforms: ${row.platforms.join(', ')}`);
    if (row.volume) lines.push(`Depth: ${row.volume}`);
    if (row.summary) lines.push(`\n### Summary\n${row.summary.slice(0, 600)}${row.summary.length > 600 ? '…' : ''}`);

    const m = row.metrics ?? {};
    if (m.topic_score != null || m.overall_sentiment != null) {
      lines.push('\n### Metrics');
      if (m.topic_score != null) lines.push(`- Topic score: ${m.topic_score}/100`);
      if (m.overall_sentiment != null) lines.push(`- Sentiment: ${m.overall_sentiment}`);
      if (m.conversation_intensity) lines.push(`- Conversation intensity: ${m.conversation_intensity}`);
    }

    const topics = row.trending_topics ?? [];
    if (topics.length > 0) {
      lines.push(`\n### Trending topics (${topics.length})`);
      for (const t of topics.slice(0, 6)) {
        lines.push(`- **${t.name}** · resonance ${t.resonance ?? '—'} · sentiment ${t.sentiment ?? '—'}`);
        for (const idea of (t.video_ideas ?? []).slice(0, 2)) {
          lines.push(`  - ${idea.title}${idea.hook ? ` — Hook: "${idea.hook}"` : ''}`);
        }
      }
    }

    return {
      success: true,
      data: {
        id: row.id,
        query: row.query,
        status: row.status,
        summary_markdown: lines.join('\n'),
      },
      link: {
        href: `/admin/search/${row.id}`,
        label: 'Open search',
      },
    };
  },
};

export const analysisTools: ToolDefinition[] = [
  getAuditSummary,
  searchAuditFindings,
  getTiktokShopSearchSummary,
  getTiktokShopCreatorDetails,
  getTopicSearchSummary,
];
