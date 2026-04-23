/**
 * Web retrieval for topic search (llm_v1):
 * - **Apify SERP** (`searchWebSearxng` — name kept for backward compat) —
 *   Google SERP via scraperlink/google-search-results-serp-scraper.
 * - **OpenRouter** (`searchWebOpenRouter`) — OpenRouter chat + web plugin (optional; uses OpenRouter key, not OpenAI).
 */
import { gatherSerpDataViaApify } from '@/lib/serp/apify-scraperlink';
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
 * Google SERP for topic search, via Apify scraperlink actor.
 * Function name retained for backward compat with earlier SearXNG calls.
 */
export async function searchWebSearxng(query: string, options: WebSearchOptions = {}): Promise<WebSearchHit[]> {
  const count = Math.min(Math.max(options.count ?? 10, 1), 20);

  const res = await gatherSerpDataViaApify(query, {
    timeRange: options.timeRange,
    limit: count,
    country: options.country,
  });

  if (!res) return [];

  const hits: WebSearchHit[] = [];
  for (const r of res.webResults) {
    if (!r.url) continue;
    hits.push({
      url: normalizeUrlForMatch(r.url),
      title: r.title ?? r.url,
      snippet: (r.description ?? '').slice(0, 500),
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
 * Default model: `TOPIC_SEARCH_OPENROUTER_WEB_MODEL` or `openai/gpt-5.4-mini`.
 *
 * Previously defaulted to `google/gemini-2.0-flash-001`, but in practice each
 * research call pulls ~40K SERP tokens into context and OpenRouter's Gemini
 * routing was billing ~$0.04/call (see 2026-04-23 usage log). GPT-5.4 Mini at
 * $0.75/M input delivers better-quality synthesis on dense web context at
 * comparable token cost, and the rest of the topic-search pipeline already
 * standardises on GPT-5.4 Mini (`DEFAULT_OPENROUTER_MODEL`), so this just
 * aligns the web plugin with the planner + merger.
 */
export async function searchWebOpenRouter(
  query: string,
  options: WebSearchOptions = {},
): Promise<OpenRouterWebSearchResult> {
  const count = Math.min(Math.max(options.count ?? 10, 1), 20);
  const envModel = process.env.TOPIC_SEARCH_OPENROUTER_WEB_MODEL?.trim();
  const base = envModel || 'openai/gpt-5.4-mini';
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

/** @deprecated Prefer `searchWebSearxng` (now Apify-backed) or `searchWebOpenRouter`. */
export const searchWeb = searchWebSearxng;
