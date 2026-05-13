/**
 * Pull social-platform handles out of a raw HTML blob.
 *
 * Used by:
 *   - app/api/clients/analyze-url           (initial prospect scrape)
 *   - app/api/clients/[id]/refresh-logo     (re-scrape when social_profiles
 *                                            is empty / has no usernames)
 *
 * Per-platform regex captures the handle segment; obvious non-handles
 * (e.g. /share, /explore) are filtered. Returns null per platform when
 * nothing plausible is found.
 */

export interface ScrapedSocials {
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  tiktok: string | null;
  linkedin: string | null;
}

function extractHandle(html: string, regex: RegExp, reject: string[]): string | null {
  const rejectSet = new Set(reject.map((r) => r.toLowerCase()));
  const matches = html.matchAll(regex);
  for (const m of matches) {
    // YouTube regex has four capture groups (one per URL shape); grab the first non-empty one.
    const handle = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (!handle) continue;
    if (rejectSet.has(handle.toLowerCase())) continue;
    if (handle.length > 50) continue;
    return handle;
  }
  return null;
}

export function extractSocialsFromHtml(html: string): ScrapedSocials {
  return {
    instagram: extractHandle(
      html,
      /(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]+)(?:\/|$|["?#])/gi,
      ['p', 'explore', 'reel', 'tv', 'stories'],
    ),
    tiktok: extractHandle(html, /tiktok\.com\/@([A-Za-z0-9._]+)(?:\/|$|["?#])/gi, []),
    facebook: extractHandle(
      html,
      /facebook\.com\/([A-Za-z0-9.]+)(?:\/|$|["?#])/gi,
      ['sharer', 'dialog', 'tr', 'plugins', 'pages'],
    ),
    youtube: extractHandle(
      html,
      /youtube\.com\/(?:@([A-Za-z0-9._-]+)|c\/([A-Za-z0-9._-]+)|channel\/([A-Za-z0-9._-]+)|user\/([A-Za-z0-9._-]+))(?:\/|$|["?#])/gi,
      [],
    ),
    linkedin: extractHandle(
      html,
      /linkedin\.com\/(?:company|in)\/([A-Za-z0-9._-]+)(?:\/|$|["?#])/gi,
      [],
    ),
  };
}

/**
 * Fetch the website and pull socials from its HTML. Returns all-null on any
 * fetch failure — caller decides whether to fall through to favicon-only.
 */
export async function scrapeSocialsFromWebsite(websiteUrl: string): Promise<ScrapedSocials> {
  const empty: ScrapedSocials = {
    instagram: null,
    facebook: null,
    youtube: null,
    tiktok: null,
    linkedin: null,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NativzBot/1.0)' },
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return empty;
    const html = await res.text();
    return extractSocialsFromHtml(html);
  } catch {
    return empty;
  }
}
