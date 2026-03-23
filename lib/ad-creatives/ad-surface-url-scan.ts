import type { OnScreenText } from './types';

/** Match http(s), www., and trailing path segments until space/paren/quote. */
const URL_LIKE_RE = /(?:https?:\/\/[^\s)\]"']+|www\.[^\s)\]"']+)/gi;

/** Bare domains (e.g. rankprompt.ai) often appear without scheme — still forbidden on static ads. */
const BARE_DOMAIN_RE = /\b[a-z0-9][a-z0-9-]{0,62}\.(?:com|ai|io|net|org|co)\b/gi;

/**
 * True only when the human-approved copy explicitly includes a URL (http(s) or www.).
 * Static feed ads normally omit URLs — then nothing may appear on the image.
 */
export function intendedCopyAllowsUrlOnImage(
  intended: OnScreenText,
  offer: string | null,
): boolean {
  const pool = `${intended.headline} ${intended.subheadline} ${intended.cta} ${offer ?? ''}`;
  if (/\bhttps?:\/\//i.test(pool) || /\bwww\./i.test(pool)) return true;
  return /\b[a-z0-9][a-z0-9-]{0,62}\.(?:com|ai|io|net|org|co)\b/i.test(pool);
}

/**
 * True if the surface URL string is explicitly present in approved copy (substring match).
 */
export function surfaceUrlAllowedByCopy(
  surfaceUrl: string,
  intended: OnScreenText,
  offer: string | null,
): boolean {
  const pool = [intended.headline, intended.subheadline, intended.cta, offer ?? ''].join(' ').toLowerCase();
  const s = surfaceUrl.toLowerCase().trim();
  if (pool.includes(s)) return true;
  const host = tryHostname(surfaceUrl);
  if (host && (pool.includes(host) || pool.includes(`www.${host}`))) return true;
  const stripped = s.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return stripped.length > 0 && pool.includes(stripped);
}

/**
 * Pull likely URL strings from OCR/extracted lines for policy checks.
 */
export function extractLikelyUrlsFromStrings(strings: string[]): string[] {
  const out = new Set<string>();
  for (const s of strings) {
    if (!s?.trim()) continue;
    for (const re of [URL_LIKE_RE, BARE_DOMAIN_RE]) {
      re.lastIndex = 0;
      const m = s.match(re);
      if (!m) continue;
      for (let u of m) {
        u = u.replace(/[.,;:!?)]+$/g, '').trim();
        if (u.length > 4) out.add(u);
      }
    }
  }
  return [...out];
}

function tryHostname(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Whether a surface URL's host disagrees with the brand's canonical site.
 */
export function surfaceUrlConflictsWithCanonical(
  surfaceUrl: string,
  canonicalClientWebsiteUrl: string | null | undefined,
): boolean {
  if (!canonicalClientWebsiteUrl?.trim()) return false;
  const hSurface = tryHostname(surfaceUrl);
  const hCanon = tryHostname(canonicalClientWebsiteUrl);
  if (!hSurface || !hCanon) return false;
  return hSurface !== hCanon;
}
