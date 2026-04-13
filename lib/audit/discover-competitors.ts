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

/**
 * Hard time budget for the whole discovery phase. The audit's process route
 * runs on Vercel with maxDuration=300s; if discovery + everything else
 * exceeds that, the function is terminated mid-flight and the audit gets
 * stuck in `processing` forever (the frontend then polls indefinitely).
 *
 * Scraping 6 candidates serially × (website ~30s + social scrape up to 180s)
 * can easily burn 18+ minutes worst-case. Cap discovery at 150s so the rest
 * of the pipeline (scorecard gen, image persistence, DB writes) has headroom.
 */
const DISCOVERY_TIME_BUDGET_MS = 150_000;

export interface LlmCandidate {
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
 *
 * Exported as `suggestCompetitorWebsites` for the confirm-platforms API
 * route that pre-fills the competitor inputs without scraping.
 */
export async function suggestCompetitorWebsites(
  websiteContext: WebsiteContext,
  targetPlatformSignals: { platform: AuditPlatform; topHashtags: string[]; followers: number }[],
): Promise<LlmCandidate[]> {
  const topSignals = targetPlatformSignals
    .map(
      (p) =>
        `${p.platform}: ${p.followers.toLocaleString()} followers · hashtags: ${p.topHashtags.slice(0, 8).join(', ') || '(none)'}`,
    )
    .join('\n');

  // Pick the primary platform for size-matching — highest follower count wins,
  // since that's usually the brand's focus platform. Gives the LLM an explicit
  // "match competitors near this scale" anchor instead of just vibes.
  const sortedByFollowers = [...targetPlatformSignals].sort((a, b) => b.followers - a.followers);
  const primary = sortedByFollowers[0];
  const sizeAnchor = primary
    ? `The target's largest platform is ${primary.platform} with ${primary.followers.toLocaleString()} followers. Pick competitors whose follower counts sit roughly between ${Math.max(500, Math.floor(primary.followers * 0.25)).toLocaleString()} and ${Math.floor(primary.followers * 5).toLocaleString()} — same scale or one tier up, NOT mega-brands 100× their size and NOT dead pages with a few hundred followers.`
    : 'Pick competitors at roughly the same scale as this brand — not mega-brands 100× their size.';

  const scopeAnchor =
    websiteContext.scope === 'local' && websiteContext.location
      ? `GEOGRAPHIC SCOPE (non-negotiable)
This is a LOCAL business operating in ${websiteContext.location}. Pick competitors in the SAME metro area or region — businesses a customer in ${websiteContext.location} would actually choose between. A national brand or a competitor in another state is WRONG for this comparison and will be rejected. If you can't confidently place a candidate in ${websiteContext.location} or the immediate surrounding area, SKIP them.`
      : `GEOGRAPHIC SCOPE (non-negotiable)
This brand operates NATIONALLY (ships DTC, franchises across states, or sells digitally). Pick nationally-recognized competitors — companies operating in the same product / service category at national scale. Single-city local competitors are WRONG for this comparison.`;

  const prompt = `You are a competitive intelligence analyst for social media strategy. Identify ${MAX_CANDIDATES_REQUESTED} direct competitors for this brand — real companies operating in the same sub-niche.

TARGET BRAND
- Name: ${websiteContext.title}
- Industry: ${websiteContext.industry}
- Description: ${websiteContext.description}
- Keywords: ${websiteContext.keywords.slice(0, 10).join(', ')}
- Scope: ${websiteContext.scope ?? 'national'}${websiteContext.location ? ` (${websiteContext.location})` : ''}
${topSignals ? `\nTARGET SOCIAL SIGNALS\n${topSignals}` : ''}

${scopeAnchor}

SCALE MATCHING (non-negotiable)
${sizeAnchor}
Competitors at a wildly different scale make the head-to-head comparison useless. If you're not sure whether a candidate is at a similar scale, SKIP them and pick someone else.

For each competitor, return their brand name and their official website domain (NOT their social media URLs — we'll scrape the website to find socials). Never invent a website — only return a domain you're confident is the official one.

Return ONLY a JSON array — no markdown fences, no prose. Shape:
[
  { "name": "Brand Name", "website": "example.com", "why": "one-sentence reason they compete" }
]

Exactly ${MAX_CANDIDATES_REQUESTED} entries, ordered most-similar-scale first.`;

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

/** Result type for scrapeOneCandidate — success or failure. */
type ScrapeCandidateOutcome =
  | { type: 'success'; competitor: CompetitorProfile }
  | { type: 'failure'; failure: CompetitorDiscoveryFailure };

/**
 * Scrape a single candidate (website → social link → platform metrics).
 * Extracted so both the LLM-driven and user-provided paths share the same body.
 */
async function scrapeOneCandidate(
  candidate: { name: string; website: string },
  targetPlatformNames: AuditPlatform[],
  discoveryStartMs: number,
): Promise<ScrapeCandidateOutcome> {
  // Re-check budget inside the helper so the override path also respects it.
  const elapsedMs = Date.now() - discoveryStartMs;
  if (elapsedMs > DISCOVERY_TIME_BUDGET_MS) {
    return {
      type: 'failure',
      failure: { name: candidate.name, website: candidate.website, reason: 'discovery time budget exceeded — skipped' },
    };
  }

  const website = normaliseWebsite(candidate.website);
  if (!website) {
    return { type: 'failure', failure: { name: candidate.name, website: candidate.website, reason: 'empty website' } };
  }

  // Scrape the candidate's website to find social links.
  let siteResult;
  try {
    siteResult = await scrapeWebsite(website);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[audit] competitor "${candidate.name}" website scrape failed: ${msg}`);
    return { type: 'failure', failure: { name: candidate.name, website, reason: `website scrape failed: ${msg}` } };
  }

  const socials = siteResult.socialLinks ?? [];
  if (socials.length === 0) {
    console.log(`[audit] competitor "${candidate.name}" has no social links on ${website}`);
    return { type: 'failure', failure: { name: candidate.name, website, reason: 'no socials on website' } };
  }

  const matchingSocial = pickComparisonPlatform(targetPlatformNames, socials);
  if (!matchingSocial) {
    console.log(
      `[audit] competitor "${candidate.name}" has socials (${socials.map((s) => s.platform).join(', ')}) but none overlap with target (${targetPlatformNames.join(', ')})`,
    );
    return {
      type: 'failure',
      failure: {
        name: candidate.name,
        website,
        reason: `no platform overlap with target (${targetPlatformNames.join(', ')})`,
      },
    };
  }

  // Scrape that platform for real metrics.
  try {
    const { profile, videos } = await scrapeSocialForCompetitor(matchingSocial);
    console.log(
      `[audit] competitor "${candidate.name}" added via ${matchingSocial.platform}: ${profile.followers} followers, ${videos.length} videos`,
    );
    return { type: 'success', competitor: buildCompetitorProfile(profile, videos) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[audit] competitor "${candidate.name}" ${matchingSocial.platform} scrape failed: ${msg}`);
    return { type: 'failure', failure: { name: candidate.name, website, reason: `${matchingSocial.platform} scrape failed: ${msg}` } };
  }
}

/**
 * Scrape user-provided competitor URLs directly, bypassing LLM discovery.
 * Each URL is treated as both the candidate name and website — we scrape it
 * to find social links, then pull real platform metrics as usual.
 */
export async function scrapeProvidedCompetitors(
  urls: string[],
  targetPlatforms: AuditPlatform[],
): Promise<CompetitorDiscoveryResult> {
  const failures: CompetitorDiscoveryFailure[] = [];
  const competitors: CompetitorProfile[] = [];

  console.log(`[audit] scrapeProvidedCompetitors: ${urls.length} user-provided URL(s): ${urls.join(', ')}`);

  const discoveryStartMs = Date.now();
  for (const url of urls) {
    if (competitors.length >= DEFAULT_TARGET_COMPETITORS) break;

    const candidate = { name: url, website: url };
    const result = await scrapeOneCandidate(candidate, targetPlatforms, discoveryStartMs);
    if (result.type === 'success') {
      competitors.push(result.competitor);
    } else {
      failures.push(result.failure);
    }
  }

  return { competitors, failures };
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
    followers: p.profile.followers,
  }));

  const candidates = await suggestCompetitorWebsites(websiteContext, targetSignals);
  if (candidates.length === 0) {
    console.warn('[audit] LLM returned zero competitor candidates');
    return { competitors, failures };
  }
  console.log(
    `[audit] LLM suggested ${candidates.length} competitor candidates: ${candidates.map((c) => c.name).join(', ')}`,
  );

  // Serial: avoid hammering Apify and any competitor's host in parallel.
  // Enforce a global time budget so we can't blow past the Vercel 300s
  // function limit and leave the audit stuck in `processing`.
  const discoveryStartMs = Date.now();
  for (const candidate of candidates) {
    if (competitors.length >= maxCompetitors) break;
    const elapsedMs = Date.now() - discoveryStartMs;
    if (elapsedMs > DISCOVERY_TIME_BUDGET_MS) {
      console.warn(
        `[audit] competitor discovery exceeded ${Math.round(DISCOVERY_TIME_BUDGET_MS / 1000)}s budget — stopping early with ${competitors.length} competitors`,
      );
      failures.push({
        name: candidate.name,
        website: candidate.website,
        reason: 'discovery time budget exceeded — skipped',
      });
      break;
    }

    const result = await scrapeOneCandidate(candidate, targetPlatformNames, discoveryStartMs);
    if (result.type === 'success') {
      competitors.push(result.competitor);
    } else {
      failures.push(result.failure);
    }
  }

  return { competitors, failures };
}
