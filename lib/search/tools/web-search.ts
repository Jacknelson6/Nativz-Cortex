/**
 * Web retrieval for topic search (llm_v1):
 * - **SearXNG** (`searchWebSearxng`) — self-hosted SearXNG instance; our primary SERP integration.
 * - **OpenRouter** (`searchWebOpenRouter`) — OpenRouter chat + web plugin (optional; uses OpenRouter key, not OpenAI).
 */
import { searxngSearch } from '@/lib/serp/client';
import { createCompletion } from '@/lib/ai/client';
import { extractUrlsFromPlainText } from '@/lib/ai/openrouter-citations';
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
  /** Usage tracking for OpenRouter web search (topic_search feature). */
  userId?: string;
  userEmail?: string;
}

/**
 * SearXNG SERP for topic search (uses `SEARXNG_URL` or defaults to localhost:8888).
 */
export async function searchWebSearxng(query: string, options: WebSearchOptions = {}): Promise<WebSearchHit[]> {
  const count = Math.min(Math.max(options.count ?? 10, 1), 20);

  const res = await searxngSearch(query, {
    timeRange: options.timeRange,
    language: options.language && options.language !== 'all' ? options.language : undefined,
    categories: 'general',
  });

  const hits: WebSearchHit[] = [];
  for (const r of res.results) {
    if (!r.url) continue;
    hits.push({
      url: normalizeUrlForMatch(r.url),
      title: r.title ?? r.url,
      snippet: (r.content ?? '').slice(0, 500),
    });
    if (hits.length >= count) break;
  }
  const urls = dedupeUrls(hits.map((h) => h.url));
  const byUrl = new Map(hits.map((h) => [normalizeUrlForMatch(h.url), h]));
  return urls.map((u) => byUrl.get(u)!).filter(Boolean);
}

export type OpenRouterWebSearchResult = {
  hits: WebSearchHit[];
  usage: { totalTokens: number; estimatedCost: number };
};

/**
 * OpenRouter web plugin (or `:online` model) — real URLs from response annotations when available.
 * Default model: `TOPIC_SEARCH_OPENROUTER_WEB_MODEL` or `google/gemini-2.0-flash-001`.
 */
export async function searchWebOpenRouter(
  query: string,
  options: WebSearchOptions = {},
): Promise<OpenRouterWebSearchResult> {
  const count = Math.min(Math.max(options.count ?? 10, 1), 20);
  const envModel = process.env.TOPIC_SEARCH_OPENROUTER_WEB_MODEL?.trim();
  const base = envModel || 'google/gemini-2.0-flash-001';
  const model = base.includes(':online') ? base.replace(/:online$/i, '') : base;

  const recency =
    options.timeRange && options.timeRange !== 'all'
      ? ` Prefer sources relevant to the user's time filter: ${options.timeRange}.`
      : '';
  const locale =
    options.country && options.country !== 'all'
      ? ` Region/country context: ${options.country}.`
      : '';
  const lang =
    options.language && options.language !== 'all' ? ` Language bias: ${options.language}.` : '';

  const prompt = `Use web search to find authoritative, relevant pages for this research query. Summarize what you find in 2–5 short sentences (no bullet list). Real page URLs are returned as citations by the search system.${recency}${locale}${lang}

Query: ${query}`;

  const ai = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1200,
    webSearch: true,
    webSearchMaxResults: count,
    feature: 'topic_search',
    userId: options.userId,
    userEmail: options.userEmail,
    modelPreference: [model],
  });

  const raw = ai.webCitations ?? [];
  let hits: WebSearchHit[] = raw.map((c) => ({
    url: normalizeUrlForMatch(c.url),
    title: c.title || c.url,
    snippet: (c.snippet ?? '').slice(0, 500),
  }));
  if (hits.length === 0 && ai.text) {
    hits = extractUrlsFromPlainText(ai.text, count).map((c) => ({
      url: c.url,
      title: c.title,
      snippet: c.snippet,
    }));
  }

  const urls = dedupeUrls(hits.map((h) => h.url));
  const byUrl = new Map(hits.map((h) => [normalizeUrlForMatch(h.url), h]));
  const deduped = urls.map((u) => byUrl.get(u)!).filter(Boolean);
  return {
    hits: deduped,
    usage: { totalTokens: ai.usage.totalTokens, estimatedCost: ai.estimatedCost },
  };
}

/** @deprecated Prefer `searchWebSearxng` or `searchWebOpenRouter` — SearXNG-backed alias. */
export const searchWeb = searchWebSearxng;
