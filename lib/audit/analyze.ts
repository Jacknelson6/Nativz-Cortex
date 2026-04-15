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
} from './types';
import type { WebsiteScrapeResult } from './scrape-website';

export interface ScorecardInputs {
  platformSummaries: PlatformReport[];
  competitors: CompetitorProfile[];
  websiteContext: { title: string; industry: string } | null;
  socialGoals?: string[];
}

// ── Extract website context via AI ──────────────────────────────────────

export async function extractWebsiteContext(
  websiteResult: WebsiteScrapeResult,
): Promise<WebsiteContext> {
  const prompt = `Analyze this website and extract business context.

URL: ${websiteResult.url}
Title: ${websiteResult.title}
Description: ${websiteResult.description}
Body text: ${websiteResult.bodyText.substring(0, 2500)}

Also determine the business's geographic scope — this drives whether we compare them against local or national competitors:
- "local" if the business serves one metro area / single location (single address, phrasing like "serving <city>", "located in <city>", one shop, one law office, one clinic, etc.)
- "national" if they ship/deliver direct-to-consumer nationwide, franchise across multiple states, operate multiple locations in different metros, or sell an SaaS / digital product with no geographic tie
If you can't tell confidently, default to "national".

When scope is "local", extract the city + state/region (e.g. "Carrollton, TX", "Brooklyn, NY"). Leave null for national brands.

Return JSON:
{
  "url": "${websiteResult.url}",
  "title": "business name or title",
  "description": "what this business does in 1-2 sentences",
  "industry": "specific industry/niche (e.g. 'personal injury law', 'local bakery', 'DTC skincare')",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "scope": "local" | "national",
  "location": "City, ST" | null,
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
      scope: 'national',
      location: null,
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

/**
 * Generate a 6-card analysis scorecard — the simple shape the sales team
 * wants on the report (Brand overview + Benchmarked against + 6 cards). The
 * 13-category deterministic-pre-grading pipeline was retired; one LLM call
 * produces all six items plus the executive summary.
 *
 * Cards (in order):
 *   1. Posting frequency
 *   2. Engagement rate
 *   3. Average views
 *   4. Hashtag strategy
 *   5. Content variety
 *   6. Bio optimization
 */
export async function generateScorecard(inputs: ScorecardInputs): Promise<AuditScorecard> {
  const platformSummaries = inputs.platformSummaries.map((p) => ({
    platform: p.platform,
    username: p.profile.username,
    bio: p.profile.bio,
    followers: p.profile.followers,
    avgViews: p.avgViews,
    engagementRate: p.engagementRate,
    postingFrequency: p.postingFrequency,
    videoCount: p.videos.length,
    topHashtags: getTopHashtags(p.videos, 10),
  }));

  const competitorSummaries = inputs.competitors.map((c) => ({
    username: c.username,
    platform: c.platform,
    followers: c.followers,
    avgViews: c.avgViews,
    engagementRate: c.engagementRate,
    postingFrequency: c.postingFrequency,
  }));

  const goalsBlock =
    inputs.socialGoals && inputs.socialGoals.length > 0
      ? `\nPROSPECT'S STATED SOCIAL GOALS (weight analysis toward these):\n${inputs.socialGoals
          .map((g) => `- ${g}`)
          .join('\n')}\n`
      : '';

  const prompt = `You are an expert social media auditor. Create a competitive analysis scorecard comparing the prospect against their direct competitors for a marketing agency sales call.

PROSPECT PLATFORMS:
${JSON.stringify(platformSummaries, null, 2)}

COMPETITORS:
${JSON.stringify(competitorSummaries, null, 2)}

${inputs.websiteContext ? `BUSINESS: ${inputs.websiteContext.title} — ${inputs.websiteContext.industry}` : ''}
${goalsBlock}

Produce EXACTLY 6 scorecard items in this order:
  1. posting_frequency — "Posting frequency" — how consistently the prospect posts short-form video.
  2. engagement_rate — "Engagement rate" — likes+comments+shares vs. followers on recent posts.
  3. avg_views — "Average views" — typical view count per post.
  4. hashtag_strategy — "Hashtag strategy" — mix/quality of branded, trending, and niche hashtags.
  5. content_variety — "Content variety" — range of formats and topics.
  6. bio_optimization — "Bio optimization" — clarity of bio, CTA, and links.

For each item:
- prospectStatus: "good" | "warning" | "poor"
- prospectValue: short phrase (e.g. "2.1% ER", "4.3 posts/week", "Thin — one format")
- competitors: up to 3 entries [{ username, status, value }]
- status_reason: one sentence (≤14 words) explaining WHY the prospect is at this status, ideally referencing a competitor.
- description: one neutral sentence explaining what the category measures.

Return ONLY JSON:
{
  "overallScore": 0-100,
  "items": [
    { "category": "posting_frequency", "label": "Posting frequency", "prospectStatus": "...", "prospectValue": "...", "competitors": [...], "status_reason": "...", "description": "..." },
    ...
  ],
  "summary": "2-sentence executive summary"
}`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4000,
    feature: 'audit_scorecard',
    jsonMode: true,
    timeoutMs: 60000,
  });

  try {
    const parsed = parseAIResponseJSON<AuditScorecard>(result.text);
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return {
        overallScore: 0,
        items: [],
        summary: 'Analysis could not be completed.',
      };
    }
    return parsed;
  } catch {
    return {
      overallScore: 0,
      items: [],
      summary: 'Analysis could not be completed.',
    };
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

/**
 * Estimate posting cadence as a short readable label ("3 posts/week",
 * "6 posts/month", etc.).
 *
 * The prior implementation divided every scraped video (up to 30) by the
 * full span between newest and oldest, then bucketed against thresholds
 * pegged for weekly+ cadence. Accounts that post 2-3× a month but have
 * back-catalog videos in the scrape (span = 300+ days) read as "infrequent"
 * — which is technically correct at 0.08 posts/day but useless on the
 * report, and wrong for comparison when the account is actually active now.
 *
 * Fix: measure from the window that matters, not the full scrape. Prefer
 * the last 90 days of content; if an account has nothing in the last 90
 * days, fall back to the full window but label the result as "dormant".
 * Replace the "infrequent" bucket with a real "N posts/month" number down
 * to 1, and surface "under 1/month" only when it's actually that sparse.
 */
export function estimatePostingFrequency(videos: ProspectVideo[]): string {
  const dated = videos
    .filter((v) => v.publishDate)
    .sort((a, b) => new Date(b.publishDate!).getTime() - new Date(a.publishDate!).getTime());
  if (dated.length === 0) return 'unknown';

  const nowMs = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const recent = dated.filter((v) => nowMs - new Date(v.publishDate!).getTime() <= ninetyDaysMs);

  // Dormant signal: account has nothing in the last 90 days. Surface that
  // explicitly rather than burying it in a low-rate math result.
  if (recent.length === 0) {
    return dated[0].publishDate ? 'dormant' : 'unknown';
  }

  // Single recent post — not enough to average a cadence. Still better
  // than "unknown" for the sales narrative.
  if (recent.length === 1) return '1 post in last 90 days';

  const newest = new Date(recent[0].publishDate!);
  const oldest = new Date(recent[recent.length - 1].publishDate!);
  const daySpan = Math.max(1, (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
  const postsPerDay = recent.length / daySpan;

  if (postsPerDay >= 1) return `${Math.round(postsPerDay)} posts/day`;
  if (postsPerDay >= 0.4) return `${Math.round(postsPerDay * 7)} posts/week`;
  const perMonth = Math.round(postsPerDay * 30);
  if (perMonth >= 1) return `${perMonth} post${perMonth === 1 ? '' : 's'}/month`;
  return 'under 1 post/month';
}

function getTopHashtags(videos: ProspectVideo[], limit: number): string[] {
  const counts: Record<string, number> = {};
  for (const v of videos) {
    // Scrapers sometimes slip null/non-string entries into `hashtags` (e.g.
    // when the source post's caption is missing). Guard before lowercasing so
    // a single bad entry doesn't crash the whole audit pipeline.
    for (const h of v.hashtags ?? []) {
      if (typeof h !== 'string') continue;
      const key = h.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
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
    bio: profile.bio ?? '',
    bioLinks: profile.bioLinks ?? [],
  };
}
