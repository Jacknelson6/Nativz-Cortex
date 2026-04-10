/**
 * Website-grounded competitor discovery for the audit.
 *
 * The old flow asked an LLM for 3-5 TikTok usernames and hoped the model had
 * seen them before. It hallucinated at will and frequently returned
 * non-existent handles or completely unrelated accounts, so the audit's
 * competitor comparison charts were mostly noise. Rewrite:
 *
 *   1. LLM returns 5-6 competitor brand + likely website candidates
 *   2. For each candidate, scrape the website we already have a helper for
 *   3. Pull social links off the website; match the first platform the
 *      target is also on so the comparison charts are apples-to-apples
 *   4. Run the real platform scraper on the found handle — this gives us
 *      real follower counts, engagement rates, avg views, and posting
 *      frequency via buildCompetitorProfile() (same pipeline the target
 *      goes through, so benchmarking is free)
 *   5. Drop any candidate whose website won't load, has no socials, or
 *      whose scrape throws. Stop once we have 3 valid competitors.
 *
 * The failures array is returned too so the process route can log which
 * candidates got dropped and why — useful for spotting systematic issues
 * (e.g. scraper blocked on a whole platform).
 */

import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { scrapeWebsite } from './scrape-website';
import { scrapeTikTokProfile } from './scrape-tiktok-profile';
import { scrapeInstagramProfile } from './scrape-instagram-profile';
import { scrapeFacebookProfile } from './scrape-facebook-profile';
import { scrapeYouTubeProfile } from './scrape-youtube-profile';
import { buildCompetitorProfile } from './analyze';
import type {
  WebsiteContext,
  PlatformReport,
  CompetitorProfile,
  AuditPlatform,
  SocialLink,
  ProspectProfile,
  ProspectVideo,
} from './types';

const MAX_CANDIDATES_REQUESTED = 6;
const DEFAULT_TARGET_COMPETITORS = 3;

interface LlmCandidate {
  name: string;
  website: string;
  why: string;
}

export interface CompetitorDiscoveryFailure {
  name: string;
  website: string;
  reason: string;
}

export interface CompetitorDiscoveryResult {
  competitors: CompetitorProfile[];
  failures: CompetitorDiscoveryFailure[];
}

/** Normalise the LLM's website guess into something scrapeWebsite can eat. */
function normaliseWebsite(raw: string): string {
  const trimmed = raw.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!trimmed) return '';
  return `https://${trimmed}`;
}

/** Pick the first platform the target AND the competitor both have.
 *  That's the one the comparison charts line up on. */
function pickComparisonPlatform(
  targetPlatforms: AuditPlatform[],
  competitorSocials: SocialLink[],
): SocialLink | null {
  for (const target of targetPlatforms) {
    const match = competitorSocials.find((s) => s.platform === target);
    if (match) return match;
  }
  return null;
}

/** Run the platform-specific scraper for the given social link. Returns
 *  profile + videos in the same shape target scrapes return so
 *  buildCompetitorProfile can consume it without branching per platform. */
async function scrapeSocialForCompetitor(
  link: SocialLink,
): Promise<{ profile: ProspectProfile; videos: ProspectVideo[] }> {
  switch (link.platform) {
    case 'tiktok':
      return scrapeTikTokProfile(link.url);
    case 'instagram':
      return scrapeInstagramProfile(link.url);
    case 'facebook':
      return scrapeFacebookProfile(link.url);
    case 'youtube':
      return scrapeYouTubeProfile(link.url);
    default:
      throw new Error(`Unsupported platform for competitor scrape: ${link.platform}`);
  }
}

/**
 * Ask the LLM for a ranked list of competitors as {name, website, why}.
 * Uses jsonMode to keep the output parseable and requests up to 6 so we
 * have runway when individual scrapes fail.
 */
async function askLlmForCompetitors(
  websiteContext: WebsiteContext,
  targetPlatformSignals: { platform: AuditPlatform; topHashtags: string[] }[],
): Promise<LlmCandidate[]> {
  const topSignals = targetPlatformSignals
    .map((p) => `${p.platform}: ${p.topHashtags.slice(0, 8).join(', ') || '(no hashtags)'}`)
    .join('\n');

  const prompt = `You are a competitive intelligence analyst for social media strategy. Identify ${MAX_CANDIDATES_REQUESTED} direct competitors for this brand — real companies operating in the same sub-niche, not industry giants unless this brand actually competes with them.

TARGET BRAND
- Name: ${websiteContext.title}
- Industry: ${websiteContext.industry}
- Description: ${websiteContext.description}
- Keywords: ${websiteContext.keywords.slice(0, 10).join(', ')}
${topSignals ? `\nTARGET SOCIAL SIGNALS\n${topSignals}` : ''}

For each competitor, return their brand name and their official website domain (NOT their social media URLs — we'll scrape the website to find socials). Prefer smaller / direct competitors over mega-brands. Never invent a website — only return a domain you're confident is the official one. If you're not sure of the exact domain, make your best guess but clearly.

Return ONLY a JSON array — no markdown fences, no prose. Shape:
[
  { "name": "Brand Name", "website": "example.com", "why": "one-sentence reason they compete" }
]

Exactly ${MAX_CANDIDATES_REQUESTED} entries, ordered most-direct first.`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1200,
    feature: 'audit_competitor_discovery',
    jsonMode: true,
  });

  try {
    // jsonMode often wraps arrays in an object, so accept both shapes.
    const raw = parseAIResponseJSON<unknown>(result.text);
    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { competitors?: unknown })?.competitors)
        ? (raw as { competitors: unknown[] }).competitors
        : [];

    return (arr as Array<{ name?: unknown; website?: unknown; why?: unknown }>)
      .filter((c) => typeof c.name === 'string' && typeof c.website === 'string')
      .map((c) => ({
        name: String(c.name).trim(),
        website: String(c.website).trim(),
        why: typeof c.why === 'string' ? c.why : '',
      }))
      .filter((c) => c.name.length > 0 && c.website.length > 0)
      .slice(0, MAX_CANDIDATES_REQUESTED);
  } catch {
    console.error('[audit] LLM competitor candidates — failed to parse JSON');
    return [];
  }
}

/**
 * Extract top hashtags from a platform report — used to give the LLM
 * signal about what kind of content the brand is making so it picks
 * better competitors.
 */
function getTopHashtags(videos: ProspectVideo[], limit: number): string[] {
  const counts: Record<string, number> = {};
  for (const v of videos) {
    for (const h of v.hashtags) counts[h.toLowerCase()] = (counts[h.toLowerCase()] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

/**
 * The rewrite. Use this instead of the old analyze.ts#discoverCompetitors
 * (which returns bare TikTok usernames that the process route then has to
 * re-scrape manually).
 */
export async function discoverCompetitorsByWebsite(
  websiteContext: WebsiteContext | null,
  targetPlatforms: PlatformReport[],
  maxCompetitors: number = DEFAULT_TARGET_COMPETITORS,
): Promise<CompetitorDiscoveryResult> {
  const failures: CompetitorDiscoveryFailure[] = [];
  const competitors: CompetitorProfile[] = [];

  if (!websiteContext) {
    return { competitors, failures };
  }

  const targetPlatformNames: AuditPlatform[] = targetPlatforms.map((p) => p.platform);
  const targetSignals = targetPlatforms.map((p) => ({
    platform: p.platform,
    topHashtags: getTopHashtags(p.videos, 10),
  }));

  const candidates = await askLlmForCompetitors(websiteContext, targetSignals);
  if (candidates.length === 0) {
    console.warn('[audit] LLM returned zero competitor candidates');
    return { competitors, failures };
  }
  console.log(
    `[audit] LLM suggested ${candidates.length} competitor candidates: ${candidates.map((c) => c.name).join(', ')}`,
  );

  // Serial: avoid hammering Apify and any competitor's host in parallel.
  for (const candidate of candidates) {
    if (competitors.length >= maxCompetitors) break;

    const website = normaliseWebsite(candidate.website);
    if (!website) {
      failures.push({ name: candidate.name, website: candidate.website, reason: 'empty website' });
      continue;
    }

    // Scrape the candidate's website to find social links.
    let siteResult;
    try {
      siteResult = await scrapeWebsite(website);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[audit] competitor "${candidate.name}" website scrape failed: ${msg}`);
      failures.push({ name: candidate.name, website, reason: `website scrape failed: ${msg}` });
      continue;
    }

    const socials = siteResult.socialLinks ?? [];
    if (socials.length === 0) {
      console.log(`[audit] competitor "${candidate.name}" has no social links on ${website}`);
      failures.push({ name: candidate.name, website, reason: 'no socials on website' });
      continue;
    }

    const matchingSocial = pickComparisonPlatform(targetPlatformNames, socials);
    if (!matchingSocial) {
      console.log(
        `[audit] competitor "${candidate.name}" has socials (${socials.map((s) => s.platform).join(', ')}) but none overlap with target (${targetPlatformNames.join(', ')})`,
      );
      failures.push({
        name: candidate.name,
        website,
        reason: `no platform overlap with target (${targetPlatformNames.join(', ')})`,
      });
      continue;
    }

    // Scrape that platform for real metrics.
    try {
      const { profile, videos } = await scrapeSocialForCompetitor(matchingSocial);
      competitors.push(buildCompetitorProfile(profile, videos));
      console.log(
        `[audit] competitor "${candidate.name}" added via ${matchingSocial.platform}: ${profile.followers} followers, ${videos.length} videos`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[audit] competitor "${candidate.name}" ${matchingSocial.platform} scrape failed: ${msg}`);
      failures.push({
        name: candidate.name,
        website,
        reason: `${matchingSocial.platform} scrape failed: ${msg}`,
      });
      continue;
    }
  }

  return { competitors, failures };
}
