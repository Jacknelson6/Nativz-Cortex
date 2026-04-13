/**
 * AI-powered analysis for the sales audit:
 * 1. Extract website context (industry, keywords) via AI
 * 2. Identify competitors
 * 3. Build platform reports with engagement metrics
 * 4. Generate scorecard
 */

import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type {
  ProspectVideo,
  CompetitorProfile,
  AuditScorecard,
  WebsiteContext,
  PlatformReport,
  ProspectProfile,
  SocialLink,
  ScorecardItem,
  CadenceDirection,
} from './types';
import {
  aggregateContentQuality,
  aggregateContentVariety,
  aggregateHookConsistency,
  computeCadenceTrend,
  computePlatformFocus,
} from './scorecard-helpers';
import type { VideoAudit } from './analyze-videos';

/** Per-brand Gemini grades, keyed by platform. */
export type BrandVideoAudits = Partial<Record<PlatformReport['platform'], VideoAudit[]>>;

export interface ScorecardInputs {
  platformSummaries: PlatformReport[];
  competitors: CompetitorProfile[];
  websiteContext: { title: string; industry: string } | null;
  prospectVideoAudits: BrandVideoAudits;
  competitorVideoAudits: Record<string, BrandVideoAudits>; // keyed by competitor username
  socialGoals?: string[];
}

const LABELS: Record<string, string> = {
  engagement_rate: 'Engagement rate',
  avg_views: 'Avg views',
  follower_to_view: 'Follower-to-view ratio',
  posting_frequency: 'Posting frequency',
  cadence_trend: 'Cadence trend',
  content_variety: 'Content variety',
  content_quality: 'Content quality',
  hook_consistency: 'Hook consistency',
  caption_optimization: 'Caption optimization',
  hashtag_strategy: 'Hashtag strategy',
  bio_optimization_account: 'Bio optimization',
  cta_intent_account: 'CTA / conversion intent',
  platform_focus_account: 'Platform focus',
};

function cadencePhrase(d: CadenceDirection): string {
  if (d === 'up') return '↑ growing';
  if (d === 'down') return '↓ losing momentum';
  return '→ stable';
}

function writeDeterministicItems(inputs: ScorecardInputs): { items: ScorecardItem[]; deltas: Record<string, unknown> } {
  const items: ScorecardItem[] = [];
  const prospect = inputs.platformSummaries;

  // Platform focus (account-level)
  const focus = computePlatformFocus(prospect);
  items.push({
    category: 'platform_focus_account',
    label: LABELS.platform_focus_account,
    prospectStatus: focus.focus === 'focused' ? 'good' : 'warning',
    prospectValue: focus.focus === 'focused' ? `${focus.primary}-focused` : 'Spread thin',
    competitors: [],   // filled by LLM narration pass
    description: '',
  });

  // Per-platform Gemini-derived grades
  for (const platform of prospect) {
    const audits = inputs.prospectVideoAudits[platform.platform] ?? [];
    if (audits.length >= 3) {
      const hc = aggregateHookConsistency(audits);
      const cv = aggregateContentVariety(audits);
      const cq = aggregateContentQuality(audits);
      items.push({
        category: 'hook_consistency',
        label: `${LABELS.hook_consistency} · ${platform.platform}`,
        prospectStatus: hc.status,
        prospectValue: `${Math.round(hc.percentage * 100)}% consistent`,
        competitors: [],
        description: '',
      });
      items.push({
        category: 'content_variety',
        label: `${LABELS.content_variety} · ${platform.platform}`,
        prospectStatus: cv.status,
        prospectValue: `${cv.count} format${cv.count === 1 ? '' : 's'}`,
        competitors: [],
        description: '',
      });
      items.push({
        category: 'content_quality',
        label: `${LABELS.content_quality} · ${platform.platform}`,
        prospectStatus: cq.status,
        prospectValue: cq.avg >= 2.3 ? 'High' : cq.avg >= 1.7 ? 'Mixed' : 'Low',
        competitors: [],
        description: '',
      });
    }
    // Cadence trend
    const trend = computeCadenceTrend(platform.videos);
    items.push({
      category: 'cadence_trend',
      label: `${LABELS.cadence_trend} · ${platform.platform}`,
      prospectStatus: trend === 'up' ? 'good' : trend === 'flat' ? 'warning' : 'poor',
      prospectValue: cadencePhrase(trend),
      competitors: [],
      description: '',
    });
  }

  return { items, deltas: {} };
}
import type { WebsiteScrapeResult } from './scrape-website';

// ── Extract website context via AI ──────────────────────────────────────

export async function extractWebsiteContext(
  websiteResult: WebsiteScrapeResult,
): Promise<WebsiteContext> {
  const prompt = `Analyze this website and extract business context.

URL: ${websiteResult.url}
Title: ${websiteResult.title}
Description: ${websiteResult.description}
Body text: ${websiteResult.bodyText.substring(0, 2000)}

Return JSON:
{
  "url": "${websiteResult.url}",
  "title": "business name or title",
  "description": "what this business does in 1-2 sentences",
  "industry": "specific industry/niche (e.g. 'fitness coaching', 'local restaurant', 'ecommerce fashion')",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "socialLinks": []
}`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 500,
    feature: 'audit_website_context',
    jsonMode: true,
  });

  try {
    const parsed = parseAIResponseJSON<WebsiteContext>(result.text);
    // Merge AI-parsed social links with scraped ones
    parsed.socialLinks = websiteResult.socialLinks;
    return parsed;
  } catch {
    return {
      url: websiteResult.url,
      title: websiteResult.title,
      description: websiteResult.description,
      industry: 'unknown',
      keywords: [],
      socialLinks: websiteResult.socialLinks,
    };
  }
}

// ── Build platform report from scraped data ─────────────────────────────

export function buildPlatformReport(
  profile: ProspectProfile,
  videos: ProspectVideo[],
): PlatformReport {
  return {
    platform: profile.platform,
    profile,
    videos,
    engagementRate: calculateEngagementRate(videos, profile.followers),
    avgViews: calculateAvgViews(videos),
    postingFrequency: estimatePostingFrequency(videos),
  };
}

// ── AI discovers competitors ────────────────────────────────────────────

export async function discoverCompetitors(
  platforms: PlatformReport[],
  websiteContext: WebsiteContext | null,
): Promise<string[]> {
  const primaryPlatform = platforms[0];
  if (!primaryPlatform) return [];

  const websiteInfo = websiteContext
    ? `Business: ${websiteContext.title}\nIndustry: ${websiteContext.industry}\nDescription: ${websiteContext.description}`
    : 'No website context';

  const topHashtags = getTopHashtags(primaryPlatform.videos, 15);

  const prompt = `You are an expert social media analyst. Identify 3-5 direct competitors on TikTok.

PROSPECT:
- @${primaryPlatform.profile.username} (${primaryPlatform.profile.displayName})
- Followers: ${primaryPlatform.profile.followers.toLocaleString()}
- Posts: ${primaryPlatform.profile.postsCount}
- Top hashtags: ${topHashtags.join(', ')}

${websiteInfo}

RECENT CONTENT:
${primaryPlatform.videos.slice(0, 8).map(v => `- ${v.description.substring(0, 100)}`).join('\n')}

Return a JSON array of 3-5 TikTok usernames (without @) of direct competitors. Choose accounts in the same niche with similar or larger followings.

Return ONLY valid JSON: ["username1", "username2", "username3"]`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 500,
    feature: 'audit_competitor_discovery',
    jsonMode: true,
  });

  try {
    const parsed = parseAIResponseJSON<string[]>(result.text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === 'string' && u.length > 0).slice(0, 5);
  } catch {
    console.error('[audit] Failed to parse competitor response');
    return [];
  }
}

// ── Generate scorecard ──────────────────────────────────────────────────

export async function generateScorecard(inputs: ScorecardInputs): Promise<AuditScorecard> {
  const deterministic = writeDeterministicItems(inputs);

  // LLM pass: grade remaining categories + write status_reason + narrate all items with competitor comparisons.
  const prompt = `You are analyzing a prospect's short-form social presence vs up to 3 competitors for a marketing agency sales call.

PROSPECT PLATFORMS:
${JSON.stringify(inputs.platformSummaries.map((p) => ({
    platform: p.platform,
    profile: { username: p.profile.username, bio: p.profile.bio, followers: p.profile.followers },
    avgViews: p.avgViews,
    engagementRate: p.engagementRate,
    postingFrequency: p.postingFrequency,
    videoCount: p.videos.length,
  })), null, 2)}

COMPETITORS:
${JSON.stringify(inputs.competitors.map((c) => ({
    username: c.username,
    platform: c.platform,
    followers: c.followers,
    avgViews: c.avgViews,
    engagementRate: c.engagementRate,
    postingFrequency: c.postingFrequency,
  })), null, 2)}

DETERMINISTIC ITEMS (already graded — you narrate competitor columns + write status_reason):
${JSON.stringify(deterministic.items, null, 2)}

${inputs.websiteContext ? `BUSINESS: ${inputs.websiteContext.title} — ${inputs.websiteContext.industry}` : ''}

${inputs.socialGoals && inputs.socialGoals.length > 0 ? `
THE PROSPECT'S STATED SOCIAL GOALS (PRIORITY):
${inputs.socialGoals.map(g => `- ${g}`).join('\n')}

Your analysis MUST centre these goals. Specifically:
- Executive summary: lead with whether the prospect's current performance supports or undermines these goals.
- status_reason for each item: if the item directly drives a stated goal and the prospect is poor, call it out as a critical blocker. If the item is good and reinforces a goal, celebrate it in one sentence.
- Competitor comparisons: emphasise metrics tied to the goals (e.g. if "Go viral and maximize engagement", engagement rate comparisons matter more than bio optimization).

Example: if goal is "Go viral and maximize engagement" and engagement rate is poor, write something like "2.1% engagement blocks virality — Dough Co hits 5.8% with consistent hook patterns you're missing."` : ''}

GRADE THESE ADDITIONAL CATEGORIES (one item each) using the schema below:
- engagement_rate, avg_views, follower_to_view, posting_frequency (per-platform — emit one item per platform)
- caption_optimization, hashtag_strategy (per-platform — hashtag is binary: "good" if hashtags used, else "poor")
- bio_optimization_account, cta_intent_account (account-level — one item each)

For EVERY item (deterministic + your new ones), fill in:
- competitors: [{username, status: "good"|"warning"|"poor", value: short string}]
- status_reason: one short sentence (≤14 words) explaining WHY the prospect is at this status. Example: "Posts 1.2×/week, Dough Co. posts 5.3×/week." Avoid words like "dying" — prefer "losing momentum".
- description: one neutral sentence explaining what the category means.

Return ONLY JSON matching:
{
  "overallScore": 0-100,
  "items": [/* all items, deterministic + your new ones */],
  "summary": "2-sentence executive summary"
}`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 6000,
    feature: 'audit_scorecard',
    jsonMode: true,
    timeoutMs: 90000,
  });

  try {
    const parsed = parseAIResponseJSON<AuditScorecard>(result.text);
    if (!parsed || !Array.isArray(parsed.items)) {
      return { overallScore: 0, items: deterministic.items, summary: 'Analysis could not be completed.' };
    }
    return parsed;
  } catch {
    return { overallScore: 0, items: deterministic.items, summary: 'Analysis could not be completed.' };
  }
}

// ── Suggest social goals ────────────────────────────────────────────────

// ── Helpers ─────────────────────────────────────────────────────────────

export function calculateEngagementRate(videos: ProspectVideo[], followers: number): number {
  if (followers === 0 || videos.length === 0) return 0;
  const totalEngagement = videos.reduce((sum, v) => sum + v.likes + v.comments + v.shares, 0);
  return totalEngagement / videos.length / followers;
}

export function calculateAvgViews(videos: ProspectVideo[]): number {
  if (videos.length === 0) return 0;
  return Math.round(videos.reduce((sum, v) => sum + v.views, 0) / videos.length);
}

export function estimatePostingFrequency(videos: ProspectVideo[]): string {
  const dated = videos.filter(v => v.publishDate).sort((a, b) =>
    new Date(b.publishDate!).getTime() - new Date(a.publishDate!).getTime()
  );
  if (dated.length < 2) return 'unknown';

  const newest = new Date(dated[0].publishDate!);
  const oldest = new Date(dated[dated.length - 1].publishDate!);
  const daySpan = Math.max(1, (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
  const postsPerDay = dated.length / daySpan;

  if (postsPerDay >= 1) return `${Math.round(postsPerDay)} posts/day`;
  if (postsPerDay >= 0.4) return `${Math.round(postsPerDay * 7)} posts/week`;
  if (postsPerDay >= 0.1) return `${Math.round(postsPerDay * 30)} posts/month`;
  return 'infrequent';
}

function getTopHashtags(videos: ProspectVideo[], limit: number): string[] {
  const counts: Record<string, number> = {};
  for (const v of videos) {
    for (const h of v.hashtags) {
      counts[h.toLowerCase()] = (counts[h.toLowerCase()] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => `#${tag}`);
}

export function buildCompetitorProfile(
  profile: ProspectProfile,
  videos: ProspectVideo[],
): CompetitorProfile {
  return {
    username: profile.username,
    displayName: profile.displayName,
    platform: profile.platform,
    followers: profile.followers,
    avatarUrl: profile.avatarUrl,
    profileUrl: profile.profileUrl,
    engagementRate: calculateEngagementRate(videos, profile.followers),
    avgViews: calculateAvgViews(videos),
    postingFrequency: estimatePostingFrequency(videos),
    recentVideos: videos,
  };
}
