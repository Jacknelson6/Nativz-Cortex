import type { TopicSearchAIResponse } from '@/lib/types/search';
import { normalizeUrlForMatch } from '@/lib/search/tools/urls';

/**
 * Build allowlist set with normalized URLs for matching.
 */
export function toAllowlistSet(urls: Iterable<string>): Set<string> {
  const s = new Set<string>();
  for (const u of urls) {
    const n = normalizeUrlForMatch(u);
    if (n) s.add(n);
  }
  return s;
}

/**
 * Keep only topic sources whose URL appears in the tool allowlist.
 */
export function filterTopicSourcesByAllowlist(
  ai: TopicSearchAIResponse,
  allowlist: Set<string>,
): TopicSearchAIResponse {
  const allowed = (url: string) => allowlist.has(normalizeUrlForMatch(url));

  return {
    ...ai,
    trending_topics: (ai.trending_topics ?? []).map((topic) => ({
      ...topic,
      sources: (topic.sources ?? []).filter((src) => allowed(src.url)),
    })),
  };
}
