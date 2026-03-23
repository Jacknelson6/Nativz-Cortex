/**
 * Trim and add a scheme for user-typed website fields.
 * Bare domains (e.g. example.com) → https://example.com
 * Local dev hosts → http://localhost…
 */
export function normalizeWebsiteUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) {
    return t.replace(/^http:\/\//i, 'https://');
  }
  if (/^localhost(?::|\b)/i.test(t) || /^127\.0\.0\.1(?::|\b)/.test(t)) {
    return `http://${t}`;
  }
  return `https://${t}`;
}

/** True if the string is a non-empty http(s) URL with a plausible hostname. */
export function isValidWebsiteUrl(normalized: string): boolean {
  if (!normalized) return false;
  try {
    const u = new URL(normalized);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    if (!host) return false;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    return host.includes('.');
  } catch {
    return false;
  }
}

/** If user input is a usable website, returns normalized URL and a short display label (hostname). */
export function tryParseUserWebsite(raw: string): { normalized: string; displayLabel: string } | null {
  const normalized = normalizeWebsiteUrl(raw);
  if (!isValidWebsiteUrl(normalized)) return null;
  try {
    const host = new URL(normalized).hostname.replace(/^www\./i, '');
    return { normalized, displayLabel: host || normalized };
  } catch {
    return null;
  }
}
