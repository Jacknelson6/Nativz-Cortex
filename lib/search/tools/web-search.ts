import { braveSearch } from '@/lib/brave/client';
import { dedupeUrls, normalizeUrlForMatch } from '@/lib/search/tools/urls';

export interface WebSearchHit {
  url: string;
  title: string;
  snippet: string;
}

export interface WebSearchOptions {
  count?: number;
  timeRange?: string;
  country?: string;
  language?: string;
}

/**
 * Single-query Brave web search for agent tool use (llm_v1 pipeline).
 */
export async function searchWeb(query: string, options: WebSearchOptions = {}): Promise<WebSearchHit[]> {
  const count = Math.min(Math.max(options.count ?? 10, 1), 20);
  const FRESHNESS_MAP: Record<string, string> = {
    last_7_days: 'pw',
    last_30_days: 'pm',
    last_3_months: 'py',
    last_6_months: 'py',
    last_year: 'py',
  };
  const freshness = options.timeRange ? FRESHNESS_MAP[options.timeRange] : undefined;

  const res = await braveSearch(query, {
    count,
    freshness,
    country: options.country && options.country !== 'all' ? options.country : undefined,
    search_lang: options.language && options.language !== 'all' ? options.language : undefined,
    extra_snippets: true,
  });

  const hits: WebSearchHit[] = [];
  const web = res.web?.results ?? [];
  for (const r of web) {
    if (!r.url) continue;
    hits.push({
      url: normalizeUrlForMatch(r.url),
      title: r.title ?? r.url,
      snippet: (r.description ?? '').slice(0, 500),
    });
  }
  const urls = dedupeUrls(hits.map((h) => h.url));
  const byUrl = new Map(hits.map((h) => [normalizeUrlForMatch(h.url), h]));
  return urls.map((u) => byUrl.get(u)!).filter(Boolean);
}
