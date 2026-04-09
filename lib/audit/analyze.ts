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

export async function generateScorecard(
  platforms: PlatformReport[],
  competitors: CompetitorProfile[],
  websiteContext: WebsiteContext | null,
): Promise<AuditScorecard> {
  const platformSummaries = platforms.map(p => ({
    platform: p.platform,
    username: p.profile.username,
    followers: p.profile.followers,
    engagementRate: (p.engagementRate * 100).toFixed(2) + '%',
    avgViews: p.avgViews,
    postingFrequency: p.postingFrequency,
    videoCount: p.videos.length,
  }));

  const competitorSummary = competitors.map(c => ({
    username: c.username,
    platform: c.platform,
    followers: c.followers,
    engagementRate: (c.engagementRate * 100).toFixed(2) + '%',
    avgViews: c.avgViews,
    postingFrequency: c.postingFrequency,
  }));

  const prompt = `You are an expert social media auditor. Create a competitive analysis scorecard.

PROSPECT PLATFORMS:
${JSON.stringify(platformSummaries, null, 2)}

COMPETITORS:
${JSON.stringify(competitorSummary, null, 2)}

${websiteContext ? `BUSINESS: ${websiteContext.title} — ${websiteContext.industry}` : ''}

Generate a scorecard. For each item, rate as "good", "warning", or "poor".

Categories:
1. Posting frequency
2. Engagement rate
3. Average views
4. Hashtag strategy
5. Content variety
6. Bio optimization
7. Follower-to-view ratio
8. Community engagement

Return JSON:
{
  "overallScore": <0-100>,
  "items": [
    {
      "category": "posting_frequency",
      "label": "Posting frequency",
      "prospectStatus": "good" | "warning" | "poor",
      "prospectValue": "description",
      "competitors": [{ "username": "comp1", "status": "good", "value": "description" }],
      "description": "What this means"
    }
  ],
  "summary": "2-3 sentence executive summary"
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
    if (!parsed || !Array.isArray(parsed.items)) {
      return { overallScore: 0, items: [], summary: 'Analysis could not be completed.' };
    }
    return parsed;
  } catch {
    return { overallScore: 0, items: [], summary: 'Analysis could not be completed.' };
  }
}

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
