// SPY-02 T03: thin orchestrator that turns a classified URL into the
// detection payload the onboard route returns. Wraps the existing
// website scraper + (when needed) a cross-platform handle pass.
//
// Heavy enrichment (followers, video samples) is SPY-03's job; this
// stays in the <30s ceiling by sticking to what we can compute from
// the website HTML + cheap regexes.

import type { ProspectPlatform } from './types';
import type { UrlClassification } from './url-classifier';
import { scrapeWebsite } from '@/lib/audit/scrape-website';
import type { SocialLink } from '@/lib/audit/types';

type Confidence = 'high' | 'medium' | 'low';

export interface DetectedSocial {
  platform: ProspectPlatform;
  handle: string;
  profile_url: string | null;
  display_name: string | null;
  confidence: Confidence;
  candidates: Array<{ handle: string; profile_url: string; reason: string }>;
}

export interface DetectionResult {
  brand_name: string;
  favicon_url: string | null;
  website_url: string | null;
  socials: DetectedSocial[];
  detection_failed: boolean;
  detection_message: string | null;
}

// Brand-name suffix junk we strip when guessing a display name from
// `<title>`. Keep ordered by specificity — "| Shop" before "|".
const TITLE_SUFFIX_PATTERNS: RegExp[] = [
  /\s*[|\-–—]\s*(official\s+site|official\s+store|home\s*page|home).*/i,
  /\s*[|\-–—]\s*(buy|shop)\s+now.*/i,
  /\s*[|\-–—].*/i,
];

function cleanTitle(raw: string): string {
  let s = raw.trim();
  for (const re of TITLE_SUFFIX_PATTERNS) {
    s = s.replace(re, '').trim();
    if (s) break;
  }
  return s;
}

// Pull `<meta property="og:site_name" content="...">` out of HTML the
// scraper already fetched. We re-fetch when we need it because the
// existing scrapeWebsite doesn't expose the raw HTML; cheap second hit.
async function fetchOgSiteName(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 NativzCortex/1.0' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function hostMinusTld(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    if (parts.length <= 2) return parts[0];
    return parts[parts.length - 3] || parts[0];
  } catch {
    return '';
  }
}

function titleCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function faviconFor(host: string | null): string | null {
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Resolve brand name per D-05: title → og:site_name → host minus TLD → @handle.
async function resolveBrandName(opts: {
  classification: UrlClassification;
  scrapeTitle: string | null;
  scrapeUrl: string | null;
}): Promise<string> {
  if (opts.scrapeTitle) {
    const cleaned = cleanTitle(opts.scrapeTitle);
    if (cleaned && cleaned.length >= 2) return cleaned;
  }
  if (opts.scrapeUrl) {
    const og = await fetchOgSiteName(opts.scrapeUrl);
    if (og) return og;
    const host = hostMinusTld(opts.scrapeUrl);
    if (host) return titleCase(host);
  }
  if (opts.classification.kind === 'social_profile') {
    return `@${opts.classification.handle}`;
  }
  const host = hostMinusTld(opts.classification.canonicalUrl);
  if (host) return titleCase(host);
  return 'Untitled prospect';
}

// AuditPlatform → ProspectPlatform mapping. We ignore LinkedIn for
// prospect socials in v1 because no scraper / no downstream use.
function mapPlatform(p: SocialLink['platform']): ProspectPlatform | null {
  if (p === 'tiktok' || p === 'instagram' || p === 'youtube' || p === 'facebook') return p;
  return null;
}

function profileUrlFor(platform: ProspectPlatform, handle: string): string {
  switch (platform) {
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`;
    case 'instagram':
      return `https://www.instagram.com/${handle}/`;
    case 'youtube':
      return handle.startsWith('UC')
        ? `https://www.youtube.com/channel/${handle}`
        : `https://www.youtube.com/@${handle.replace(/^@/, '')}`;
    case 'facebook':
      return `https://www.facebook.com/${handle}`;
  }
}

// Convert scraped social links → DetectedSocial[]. When two links point
// at the same platform we keep the first as the primary candidate and
// fold the rest into `candidates[]` so the rep can swap manually.
function buildSocialsFromLinks(links: SocialLink[]): DetectedSocial[] {
  const byPlatform = new Map<ProspectPlatform, SocialLink[]>();
  for (const l of links) {
    const platform = mapPlatform(l.platform);
    if (!platform) continue;
    const list = byPlatform.get(platform) ?? [];
    list.push(l);
    byPlatform.set(platform, list);
  }

  const out: DetectedSocial[] = [];
  for (const [platform, group] of byPlatform.entries()) {
    const [primary, ...rest] = group;
    const confidence: Confidence = group.length === 1 ? 'high' : 'medium';
    out.push({
      platform,
      handle: primary.username,
      profile_url: primary.url,
      display_name: null,
      confidence,
      candidates: rest.map((r) => ({
        handle: r.username,
        profile_url: r.url,
        reason: 'Additional handle found in website HTML',
      })),
    });
  }
  return out;
}

export async function detectSocials({
  classification,
}: {
  classification: UrlClassification;
}): Promise<DetectionResult> {
  // Branch A: seed is a social profile. Skip the website scrape entirely;
  // the handle IS the detection, and the website discovery / cross-platform
  // enrichment lives in SPY-03's runInitialAnalysis (heavier work).
  if (classification.kind === 'social_profile') {
    const platform = classification.platform;
    const handle = classification.handle;
    const social: DetectedSocial = {
      platform,
      handle,
      profile_url: classification.canonicalUrl,
      display_name: null,
      confidence: 'high',
      candidates: [],
    };
    const brand_name = `@${handle}`;
    const favicon_url = faviconFor(hostFromUrl(classification.canonicalUrl));
    return {
      brand_name,
      favicon_url,
      website_url: null,
      socials: [social],
      detection_failed: false,
      detection_message: null,
    };
  }

  // Branch B: website. Scrape, parse socials, derive brand name + favicon.
  try {
    const scrape = await scrapeWebsite(classification.canonicalUrl);
    const socials = buildSocialsFromLinks(scrape.socialLinks);
    const brand_name = await resolveBrandName({
      classification,
      scrapeTitle: scrape.title || null,
      scrapeUrl: scrape.url,
    });
    return {
      brand_name,
      favicon_url: faviconFor(hostFromUrl(scrape.url)),
      website_url: scrape.url,
      socials,
      detection_failed: false,
      detection_message: null,
    };
  } catch (err) {
    // Scrape failed — never strand the rep (D-03). Return a bare detection
    // with a host-derived brand-name guess so the prospect row still has
    // something useful, plus a clear failure message for the UI.
    const host = hostFromUrl(classification.canonicalUrl);
    const fallbackName = host ? titleCase(hostMinusTld(classification.canonicalUrl)) : 'Untitled prospect';
    const message = err instanceof Error ? err.message : 'Could not reach that URL.';
    return {
      brand_name: fallbackName,
      favicon_url: faviconFor(host),
      website_url: classification.canonicalUrl,
      socials: [],
      detection_failed: true,
      detection_message: message,
    };
  }
}
