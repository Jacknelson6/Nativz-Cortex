const MAX_URLS = 50;

function isLikelyNoiseUrl(u: string): boolean {
  const lower = u.toLowerCase();
  return (
    lower.includes('emoji') ||
    lower.includes('1x1') ||
    lower.includes('pixel') ||
    lower.includes('tracking') ||
    lower.includes('.gif')
  );
}

/**
 * Pull static creative image URLs from Meta Ad Library HTML (best-effort).
 * The library is JS-heavy; the initial HTML often still embeds CDN URLs for thumbnails.
 */
export function extractMetaAdLibraryImageUrls(html: string): string[] {
  const found = new Set<string>();
  const normalized = html.replace(/\\\//g, '/');

  const patterns = [
    /https:\/\/scontent[^"'\\\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s<>]*)?/gi,
    /https:\/\/[^"'\\\s<>]*\.fbcdn\.net[^"'\\\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s<>]*)?/gi,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(normalized)) !== null) {
      const raw = m[0];
      if (raw.length < 48) continue;
      if (isLikelyNoiseUrl(raw)) continue;
      found.add(raw);
      if (found.size >= MAX_URLS) return [...found];
    }
  }

  return [...found];
}

export function isMetaAdLibraryUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('facebook.com') && u.pathname.includes('/ads/library');
  } catch {
    return false;
  }
}
