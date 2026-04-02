import type { PlatformSource } from '@/lib/types/search';

export type SourceSortMode = 'recent' | 'views' | 'similar';

export interface SourceSortContext {
  searchQuery: string;
  industry?: string;
  clientName?: string;
  topicKeywords?: string[];
}

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Lexical overlap between source text and topic + client signals (higher = more on-brand). */
export function sourceBrandSimilarityScore(
  source: PlatformSource,
  ctx: SourceSortContext,
): number {
  const text = `${source.title} ${source.content}`.toLowerCase();
  const terms = new Set<string>();
  const addWords = (s: string) => {
    for (const w of s.toLowerCase().split(/[\s,;.]+/).filter((x) => x.length > 2)) {
      terms.add(w);
    }
  };
  addWords(ctx.searchQuery);
  if (ctx.industry) addWords(ctx.industry);
  if (ctx.clientName) addWords(ctx.clientName);
  for (const k of ctx.topicKeywords ?? []) {
    if (typeof k === 'string') addWords(k);
  }
  let score = 0;
  for (const t of terms) {
    if (text.includes(t)) score += 1;
  }
  const q = ctx.searchQuery.trim().toLowerCase();
  if (q.length > 3 && text.includes(q)) score += 3;
  return score;
}

export function sortSources(
  list: PlatformSource[],
  mode: SourceSortMode,
  ctx: SourceSortContext,
): PlatformSource[] {
  const copy = [...list];
  const byId = (a: PlatformSource, b: PlatformSource) => a.id.localeCompare(b.id);

  switch (mode) {
    case 'recent':
      return copy.sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt) || byId(a, b));
    case 'views':
      return copy.sort(
        (a, b) =>
          (b.engagement.views ?? 0) - (a.engagement.views ?? 0) ||
          parseTime(b.createdAt) - parseTime(a.createdAt) ||
          byId(a, b),
      );
    case 'similar':
      return copy.sort(
        (a, b) =>
          sourceBrandSimilarityScore(b, ctx) - sourceBrandSimilarityScore(a, ctx) ||
          (b.engagement.views ?? 0) - (a.engagement.views ?? 0) ||
          byId(a, b),
      );
    default:
      return copy;
  }
}
