import type { ProspectVideo } from './types';

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/**
 * Merge platform-supplied bio-link fields with URLs we can extract from the
 * raw bio text and return a clean, de-duplicated list. Every scraper calls
 * this so the `bioLinks` shape is consistent — prospects + competitors on
 * every platform get the same type guarantees.
 */
export function collectBioLinks(
  bio: string | null | undefined,
  platformLinks: (string | null | undefined)[] = [],
): string[] {
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    if (!raw || typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Strip trailing punctuation commonly attached when URLs are inlined in
    // captions/bios ("…more at https://shop.com.").
    const cleaned = trimmed.replace(/[.,;:)\]}'"»›]+$/, '');
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
  };

  for (const link of platformLinks) push(link);
  if (bio) {
    const matches = bio.match(URL_RE) ?? [];
    for (const m of matches) push(m);
  }
  return Array.from(seen).map((k) => k);
}

/**
 * Keep only videos from the last `days` days. Preserves ordering. Videos
 * without a publish date stay in the result (they might be pinned content
 * or scraper drift) — callers who want a strict window can filter again.
 */
export function filterLastNDays(videos: ProspectVideo[], days = 30): ProspectVideo[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return videos.filter((v) => {
    if (!v.publishDate) return true;
    const t = new Date(v.publishDate).getTime();
    if (Number.isNaN(t)) return true;
    return t >= cutoff;
  });
}
