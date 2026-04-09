/**
 * AI-powered analysis for the sales audit:
 * 1. Identify competitors from profile + website context
 * 2. Generate a scorecard comparing prospect vs competitors
 */

import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type {
  ProspectData,
  ProspectVideo,
  CompetitorProfile,
  AuditScorecard,
  WebsiteContext,
} from './types';
import type { TikTokProfileResult } from './scrape-tiktok-profile';
import type { WebsiteScrapeResult } from './scrape-website';

// ── Step 1: Build prospect data from raw scrape results ─────────────────

export function buildProspectData(
  profileResult: TikTokProfileResult,
  websiteResult: WebsiteScrapeResult | null,
  websiteContext: WebsiteContext | null,
): ProspectData {
  const { profile, videos } = profileResult;
  const engagementRate = calculateEngagementRate(videos, profile.followers);
  const avgViews = calculateAvgViews(videos);
  const postingFrequency = estimatePostingFrequency(videos);

  return {
    profile,
    recentVideos: videos,
    websiteContext,
    engagementRate,
    avgViews,
    postingFrequency,
  };
}

// ── Step 2: AI identifies competitors ───────────────────────────────────

export async function discoverCompetitors(
  prospect: ProspectData,
  websiteResult: WebsiteScrapeResult | null,
): Promise<string[]> {
  const websiteInfo = websiteResult
    ? `Website: ${websiteResult.title}\nDescription: ${websiteResult.description}\nContent: ${websiteResult.bodyText.substring(0, 1500)}`
    : 'No website provided';

  const topHashtags = getTopHashtags(prospect.recentVideos, 15);

  const prompt = `You are an expert social media analyst. Analyze this TikTok profile and identify 3-5 direct competitors on TikTok.

PROSPECT PROFILE:
- Username: @${prospect.profile.username}
- Display name: ${prospect.profile.displayName}
- Bio: ${prospect.profile.bio}
- Followers: ${prospect.profile.followers.toLocaleString()}
- Posts: ${prospect.profile.postsCount}
- Top hashtags used: ${topHashtags.join(', ')}

WEBSITE CONTEXT:
${websiteInfo}

RECENT VIDEO TOPICS:
${prospect.recentVideos.slice(0, 10).map(v => `- ${v.description.substring(0, 100)}`).join('\n')}

Return a JSON array of 3-5 TikTok usernames (without the @ symbol) of direct competitors in the same niche/industry. Choose accounts that:
1. Are in the same industry or niche
2. Have similar or larger followings
3. Post similar types of content
4. Are active on TikTok

Return ONLY valid JSON: ["username1", "username2", "username3"]`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 500,
    feature: 'audit_competitor_discovery',
    jsonMode: true,
  });

  try {
    const parsed = parseAIResponseJSON<string[]>(result.text);
    if (!Array.isArray(parsed)) {
      console.error('[audit] Failed to parse competitor usernames:', result.text);
      return [];
    }
    return parsed.filter((u): u is string => typeof u === 'string' && u.length > 0).slice(0, 5);
  } catch (err) {
    console.error('[audit] Failed to parse competitor response:', err);
    return [];
  }
}

// ── Step 3: Build competitor profiles from scraped data ─────────────────

export function buildCompetitorProfile(
  profileResult: TikTokProfileResult,
): CompetitorProfile {
  const { profile, videos } = profileResult;
  return {
    username: profile.username,
    displayName: profile.displayName,
    followers: profile.followers,
    avatarUrl: profile.avatarUrl,
    profileUrl: profile.profileUrl,
    engagementRate: calculateEngagementRate(videos, profile.followers),
    avgViews: calculateAvgViews(videos),
    postingFrequency: estimatePostingFrequency(videos),
    recentVideos: videos,
  };
}

// ── Step 4: Generate scorecard ──────────────────────────────────────────

export async function generateScorecard(
  prospect: ProspectData,
  competitors: CompetitorProfile[],
  websiteContext: WebsiteContext | null,
): Promise<AuditScorecard> {
  const competitorSummary = competitors.map(c => ({
    username: c.username,
    followers: c.followers,
    engagementRate: (c.engagementRate * 100).toFixed(2) + '%',
    avgViews: c.avgViews,
    postingFrequency: c.postingFrequency,
    topHashtags: getTopHashtags(c.recentVideos, 5).join(', '),
    videoCount: c.recentVideos.length,
  }));

  const prompt = `You are an expert social media auditor creating a competitive analysis scorecard for a TikTok account.

PROSPECT:
- @${prospect.profile.username} (${prospect.profile.displayName})
- Followers: ${prospect.profile.followers.toLocaleString()}
- Engagement rate: ${(prospect.engagementRate * 100).toFixed(2)}%
- Avg views: ${prospect.avgViews.toLocaleString()}
- Posting frequency: ${prospect.postingFrequency}
- Bio: ${prospect.profile.bio}
- Top hashtags: ${getTopHashtags(prospect.recentVideos, 10).join(', ')}
${websiteContext ? `- Industry: ${websiteContext.industry}` : ''}

COMPETITORS:
${JSON.stringify(competitorSummary, null, 2)}

Generate a scorecard comparing the prospect against their competitors across these categories. For each item, rate as "good", "warning", or "poor".

Categories to evaluate:
1. Posting frequency - Are they posting consistently? (daily = good, few times/week = warning, weekly or less = poor)
2. Engagement rate - How does their engagement compare to competitors?
3. Average views - How do their views compare?
4. Hashtag strategy - Are they using a mix of branded, trending, and niche hashtags?
5. Content variety - Do they cover diverse topics/formats or are they repetitive?
6. Bio optimization - Does their bio have a clear CTA, links, and description?
7. Follower-to-view ratio - Are their views proportional to their followers?
8. Community engagement - Based on comment counts, are they engaging with their audience?

Return JSON in this exact format:
{
  "overallScore": <0-100>,
  "items": [
    {
      "category": "posting_frequency",
      "label": "Posting frequency",
      "prospectStatus": "good" | "warning" | "poor",
      "prospectValue": "description of their performance",
      "competitors": [
        { "username": "competitor1", "status": "good" | "warning" | "poor", "value": "description" }
      ],
      "description": "What this means and why it matters"
    }
  ],
  "summary": "2-3 sentence executive summary of key findings"
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
      console.error('[audit] Failed to parse scorecard:', result.text.substring(0, 500));
      return { overallScore: 0, items: [], summary: 'Analysis could not be completed.' };
    }
    return parsed;
  } catch (err) {
    console.error('[audit] Failed to parse scorecard:', err);
    return { overallScore: 0, items: [], summary: 'Analysis could not be completed.' };
  }
}

// ── Step 5: Extract website context via AI ──────────────────────────────

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
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 500,
    feature: 'audit_website_context',
    jsonMode: true,
  });

  try {
    return parseAIResponseJSON<WebsiteContext>(result.text);
  } catch {
    return {
      url: websiteResult.url,
      title: websiteResult.title,
      description: websiteResult.description,
      industry: 'unknown',
      keywords: [],
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function calculateEngagementRate(videos: ProspectVideo[], followers: number): number {
  if (followers === 0 || videos.length === 0) return 0;
  const totalEngagement = videos.reduce((sum, v) => sum + v.likes + v.comments + v.shares, 0);
  return totalEngagement / videos.length / followers;
}

function calculateAvgViews(videos: ProspectVideo[]): number {
  if (videos.length === 0) return 0;
  return Math.round(videos.reduce((sum, v) => sum + v.views, 0) / videos.length);
}

function estimatePostingFrequency(videos: ProspectVideo[]): string {
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
