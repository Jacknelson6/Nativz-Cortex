/**
 * Normalize URLs for dedupe and allowlist matching (topic search tools).
 */

export function normalizeUrlForMatch(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    u.pathname = u.pathname.replace(/\/$/, '') || '/';
    return u.toString();
  } catch {
    return raw.trim();
  }
}

export function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const n = normalizeUrlForMatch(u);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
