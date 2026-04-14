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

/**
 * HEAD-check each candidate's domain and drop anything that doesn't resolve.
 *
 * LLMs hallucinate plausible-sounding domains — e.g. "sapahouse.com" for a
 * Vietnamese restaurant that doesn't exist. Before we surface a list to the
 * user we probe each domain to make sure it's real. Runs requests in parallel
 * with a short per-candidate timeout so the whole check finishes in a few
 * seconds even when many candidates are dead.
 */
export async function filterReachableCandidates<T extends { website: string }>(
  candidates: T[],
  timeoutMs: number = 4000,
): Promise<T[]> {
  async function probe(url: string): Promise<boolean> {
    const target = url.startsWith('http') ? url : `https://${url}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // HEAD first — many sites accept it and return fast
      const headRes = await fetch(target, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });
      if (headRes.ok || (headRes.status >= 300 && headRes.status < 400)) return true;
      // Some hosts refuse HEAD (405) — fall back to a range-limited GET
      if (headRes.status === 405) {
        const getRes = await fetch(target, {
          method: 'GET',
          signal: controller.signal,
          headers: { range: 'bytes=0-1024' },
          redirect: 'follow',
        });
        return getRes.ok;
      }
      return false;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  const results = await Promise.all(
    candidates.map(async (c) => ({ candidate: c, ok: await probe(c.website) })),
  );
  return results.filter((r) => r.ok).map((r) => r.candidate);
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
  options: { scopeOverride?: 'national' | 'local' } = {},
): Promise<LlmCandidate[]> {
  // When the caller provides an explicit scope, trust it over whatever the
  // website-context extractor inferred. Users toggling "local / national"
  // on the confirm screen are a stronger signal than a keyword sniff of
  // the homepage.
  const effectiveScope = options.scopeOverride ?? websiteContext.scope ?? 'national';
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
    effectiveScope === 'local'
      ? `GEOGRAPHIC SCOPE
This is a LOCAL business${websiteContext.location ? ` operating in ${websiteContext.location}` : ''}. Strongly prefer competitors in the SAME metro area or region — businesses a customer${websiteContext.location ? ` in ${websiteContext.location}` : ''} would actually choose between. If you cannot find enough same-metro competitors to reach 3+ candidates, it is acceptable to include a handful from the broader region (same state or nearby major metro).`
      : `GEOGRAPHIC SCOPE (non-negotiable)
This brand operates NATIONALLY (ships DTC, franchises across states, or sells digitally). Pick nationally-recognized competitors — companies operating in the same product / service category at national scale. Single-city local competitors are WRONG for this comparison.`;

  const prompt = `You are a competitive intelligence analyst for social media strategy. Identify ${MAX_CANDIDATES_REQUESTED} direct competitors for this brand — real companies operating in the same sub-niche.

TARGET BRAND
- Name: ${websiteContext.title}
- Industry: ${websiteContext.industry}
- Description: ${websiteContext.description}
- Keywords: ${websiteContext.keywords.slice(0, 10).join(', ')}
- Scope: ${effectiveScope}${websiteContext.location ? ` (${websiteContext.location})` : ''}
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

Up to ${MAX_CANDIDATES_REQUESTED} entries, minimum 3, ordered most-similar-scale first.`;

  const result = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1200,
    feature: 'audit_competitor_discovery',
    jsonMode: true,
  });

  function looksLikeCandidateArray(val: unknown): val is Array<{ name?: unknown; website?: unknown }> {
    if (!Array.isArray(val) || val.length === 0) return false;
    return val.some(
      (entry) =>
        entry && typeof entry === 'object'
        && typeof (entry as { name?: unknown }).name === 'string'
        && typeof (entry as { website?: unknown }).website === 'string',
    );
  }

  function findCandidateArray(raw: unknown): Array<{ name?: unknown; website?: unknown; why?: unknown }> {
    if (looksLikeCandidateArray(raw)) return raw as Array<{ name?: unknown; website?: unknown; why?: unknown }>;
    if (raw && typeof raw === 'object') {
      // Scan all values of the wrapper object for the first array of candidate-shaped entries.
      // Handles variations like { competitors: [...] }, { results: [...] }, { data: [...] }, and
      // nested cases like { response: { competitors: [...] } }.
      for (const value of Object.values(raw as Record<string, unknown>)) {
        if (looksLikeCandidateArray(value)) return value as Array<{ name?: unknown; website?: unknown; why?: unknown }>;
        if (value && typeof value === 'object') {
          const nested = findCandidateArray(value);
          if (nested.length > 0) return nested;
        }
      }
    }
    return [];
  }

  function parseRawCandidates(text: string): LlmCandidate[] {
    const raw = parseAIResponseJSON<unknown>(text);
    const arr = findCandidateArray(raw);

    return arr
      .filter((c) => typeof c.name === 'string' && typeof c.website === 'string')
      .map((c) => ({
        name: String(c.name).trim(),
        website: String(c.website).trim(),
        why: typeof c.why === 'string' ? c.why : '',
      }))
      .filter((c) => c.name.length > 0 && c.website.length > 0)
      .slice(0, MAX_CANDIDATES_REQUESTED);
  }

  try {
    // jsonMode often wraps arrays in an object, so accept both shapes.
    const parsed = parseRawCandidates(result.text);

    if (parsed.length > 0) return parsed;

    // First pass returned 0 — log and retry with a simpler prompt.
    console.warn(
      `[audit] askLlmForCompetitors: first pass returned 0 — raw response (first 500 chars): ${result.text.slice(0, 500)}`,
    );
    console.warn('[audit] askLlmForCompetitors: first pass returned 0 — retrying with relaxed prompt');

    const fallbackPrompt = `Name 5 direct competitors for this business as JSON: [{"name":"...","website":"...","why":"..."}].
Business: ${websiteContext.title} — ${websiteContext.industry} — ${websiteContext.description}
${websiteContext.scope === 'local' && websiteContext.location ? `Location: ${websiteContext.location}. Prefer same-metro competitors.` : 'National scale competitors.'}
Return JSON only, no prose.`;

    const retry = await createCompletion({
      messages: [{ role: 'user', content: fallbackPrompt }],
      maxTokens: 800,
      feature: 'audit_competitor_discovery',
      jsonMode: true,
      timeoutMs: 30000,
    });

    try {
      const retryParsed = parseRawCandidates(retry.text);
      if (retryParsed.length > 0) return retryParsed.slice(0, MAX_CANDIDATES_REQUESTED);
      console.warn(
        `[audit] askLlmForCompetitors: retry also returned 0 — raw response (first 500 chars): ${retry.text.slice(0, 500)}`,
      );
    } catch {
      console.error('[audit] LLM competitor candidates retry — failed to parse JSON');
    }

    // Third-tier fallback: flip the scope assumption. If the first two tiers
    // were told "national" (and got 0), try again as if this is a local brand —
    // and vice versa. Scope misclassification by the website-context extractor
    // is the most common reason earlier tiers return nothing for things like
    // single-city physical therapy practices.
    const flippedScope = websiteContext.scope === 'local' ? 'national' : 'local';
    console.warn(`[audit] askLlmForCompetitors: retry also returned 0 — flipping scope to ${flippedScope}`);
    const flipPrompt = `Name 5 direct competitors for this business as JSON: [{"name":"...","website":"...","why":"..."}].
Business: ${websiteContext.title} — ${websiteContext.industry} — ${websiteContext.description}
${flippedScope === 'local' && websiteContext.location
    ? `Treat this as a LOCAL business in ${websiteContext.location}; return competitors in the same metro area or region.`
    : flippedScope === 'local'
      ? 'Treat this as a LOCAL single-location business; return competitors in the same kind of local market.'
      : 'Treat this as a NATIONAL/online business; return nationally-recognized competitors in the same category.'}
Return JSON only, no prose.`;
    const flipRes = await createCompletion({
      messages: [{ role: 'user', content: flipPrompt }],
      maxTokens: 800,
      feature: 'audit_competitor_discovery',
      jsonMode: true,
      timeoutMs: 30000,
    });
    try {
      const flipParsed = parseRawCandidates(flipRes.text);
      if (flipParsed.length > 0) return flipParsed;
      console.warn(`[audit] askLlmForCompetitors: flipped-scope attempt returned 0 — raw: ${flipRes.text.slice(0, 500)}`);
    } catch {
      console.error('[audit] LLM competitor candidates flipped-scope — failed to parse JSON');
    }

    // Fourth-tier safety net: industry-only, no scope, no scale, no geo.
    // This should basically never return 0 — if it does, the LLM layer itself
    // is broken and the route's empty-result logging will surface it.
    console.warn('[audit] askLlmForCompetitors: flipped scope also returned 0 — industry-only safety net');
    const industryOnlyPrompt = `List 5 real companies that compete in the same industry. Return JSON only, no prose.
Format: [{"name":"Company Name","website":"example.com","why":"one-sentence reason"}]
Industry: ${websiteContext.industry || websiteContext.description || websiteContext.title}
${websiteContext.location ? `Region: ${websiteContext.location} (prefer nearby, but any are acceptable).` : ''}
You MUST return at least 3 real companies. If the industry is ambiguous, make your best guess — never return an empty list.`;
    const industryOnly = await createCompletion({
      messages: [{ role: 'user', content: industryOnlyPrompt }],
      maxTokens: 800,
      feature: 'audit_competitor_discovery',
      jsonMode: true,
      timeoutMs: 30000,
    });
    try {
      const industryOnlyParsed = parseRawCandidates(industryOnly.text);
      if (industryOnlyParsed.length > 0) return industryOnlyParsed;
      console.warn(`[audit] askLlmForCompetitors: industry-only safety net returned 0 — raw: ${industryOnly.text.slice(0, 500)}`);
    } catch {
      console.error('[audit] LLM competitor candidates industry-only — failed to parse JSON');
    }

    return [];
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
    console.log(`[audit] competitor "${candidate.name}" website scrape failed: ${msg} — adding stub competitor`);
    // Soft failure: the LLM suggested this brand. Surface it as a stub with 0
    // stats so the report shows "we found these competitors but couldn't pull
    // full metrics." Use the target's primary platform for the stub entry.
    const stubPlatform = targetPlatformNames[0] ?? 'tiktok';
    const stub: CompetitorProfile = {
      username: candidate.name,
      displayName: candidate.name,
      platform: stubPlatform,
      followers: 0,
      avatarUrl: null,
      profileUrl: website,
      engagementRate: 0,
      avgViews: 0,
      postingFrequency: 'unknown',
      recentVideos: [],
    };
    return { type: 'success', competitor: stub };
  }

  const socials = siteResult.socialLinks ?? [];
  if (socials.length === 0) {
    console.log(`[audit] competitor "${candidate.name}" has no social links on ${website} — adding stub competitor`);
    // Soft failure: website loaded but had no social links. Still surface the brand.
    const stubPlatform = targetPlatformNames[0] ?? 'tiktok';
    const stub: CompetitorProfile = {
      username: candidate.name,
      displayName: candidate.name,
      platform: stubPlatform,
      followers: 0,
      avatarUrl: null,
      profileUrl: website,
      engagementRate: 0,
      avgViews: 0,
      postingFrequency: 'unknown',
      recentVideos: [],
    };
    return { type: 'success', competitor: stub };
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
    console.log(`[audit] competitor "${candidate.name}" ${matchingSocial.platform} scrape failed: ${msg} — adding stub competitor`);
    // Soft failure: social scrape failed (timeout, 403, etc.) but we confirmed
    // this brand competes. Surface it as a stub so the report isn't empty just
    // because one scraper was blocked. The username comes from the social link.
    const stub: CompetitorProfile = {
      username: matchingSocial.username || candidate.name,
      displayName: candidate.name,
      platform: matchingSocial.platform,
      followers: 0,
      avatarUrl: null,
      profileUrl: matchingSocial.url,
      engagementRate: 0,
      avgViews: 0,
      postingFrequency: 'unknown',
      recentVideos: [],
    };
    return { type: 'success', competitor: stub };
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

    // Users paste social URLs (instagram.com/handle, tiktok.com/@handle, etc.)
    // more often than company websites. If the URL is a direct social profile,
    // skip the website hop and scrape the social platform directly — matches
    // what the confirm-platforms UI accepts for the prospect.
    const directSocial = detectSocialFromUrl(url);
    if (directSocial) {
      try {
        const { profile, videos } = await scrapeSocialForCompetitor({
          platform: directSocial.platform,
          username: directSocial.username,
          url,
        });
        console.log(
          `[audit] competitor (provided) via ${directSocial.platform}: ${profile.username} — ${profile.followers} followers, ${videos.length} videos`,
        );
        competitors.push(buildCompetitorProfile(profile, videos));
        continue;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[audit] competitor (provided) ${directSocial.platform} scrape failed for ${url}: ${msg}`);
        failures.push({ name: url, website: url, reason: `${directSocial.platform} scrape failed: ${msg}` });
        continue;
      }
    }

    // Otherwise treat it as a website — same path as LLM-suggested candidates.
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
 * Best-effort detection of a direct social URL. Returns null for websites.
 * Intentionally conservative — we only match when we're sure what platform
 * it is, so ambiguous inputs fall through to the website-scrape path.
 */
function detectSocialFromUrl(raw: string): { platform: AuditPlatform; username: string } | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const firstSeg = u.pathname.split('/').filter(Boolean)[0] ?? '';
    const username = firstSeg.replace(/^@+/, '');
    if (!username) return null;
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      return { platform: 'tiktok', username };
    }
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
      return { platform: 'instagram', username };
    }
    if (
      host === 'facebook.com' ||
      host === 'fb.com' ||
      host.endsWith('.facebook.com')
    ) {
      return { platform: 'facebook', username };
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
      return { platform: 'youtube', username };
    }
    return null;
  } catch {
    return null;
  }
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
