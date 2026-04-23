// lib/quora/client.ts — Quora data gathering via Apify SERP + Google Serper
//
// Quora has no public API and actively blocks scrapers.
// Strategy: Apify Google SERP finds Quora threads, Serper gives extra coverage.

import { gatherSerpDataViaApify } from '@/lib/serp/apify-scraperlink';

export interface QuoraThread {
  id: string;
  question: string;
  url: string;
  topAnswer: string;
  answerCount: number | null;
  source: 'searxng' | 'serper';
}

export interface QuoraSearchResult {
  threads: QuoraThread[];
  totalResults: number;
}

/**
 * Find Quora threads via Apify Google SERP (site:quora.com + query).
 * Name-retained source: 'searxng' in the return shape is a legacy tag — the
 * actual provider is now Apify. Keeping it stable avoids churn downstream.
 */
async function searchSearxngQuora(query: string, timeRange: string, count: number): Promise<QuoraThread[]> {
  try {
    const res = await gatherSerpDataViaApify(`site:quora.com ${query}`, {
      timeRange,
      limit: Math.max(10, count),
    });

    const threads: QuoraThread[] = [];
    const seenUrls = new Set<string>();
    const results = res?.webResults ?? [];
    console.log(`[quora] Apify SERP response — results: ${results.length}`);

    for (const r of results) {
      if (!r.url?.includes('quora.com') || seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);
      threads.push({
        id: `quora-apify-${r.url}`,
        question: r.title?.replace(' - Quora', '') ?? '',
        url: r.url,
        topAnswer: r.description ?? '',
        answerCount: null,
        source: 'searxng',
      });
      if (threads.length >= count) break;
    }

    console.log(`[quora] Total Apify threads found: ${threads.length}`);
    return threads;
  } catch (err) {
    console.error('[quora] Apify SERP error:', err);
    return [];
  }
}

/**
 * Search Serper for Quora discussions (Google's index often has better Quora coverage).
 */
async function searchSerperQuora(query: string, timeRange: string, count: number): Promise<QuoraThread[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    console.warn('[quora] No SERPER_API_KEY — skipping Serper search');
    return [];
  }

  const TIME_RANGE_MAP: Record<string, string> = {
    last_7_days: 'qdr:w',
    last_30_days: 'qdr:m',
    last_3_months: 'qdr:m3',
    last_6_months: 'qdr:m6',
    last_year: 'qdr:y',
  };

  try {
    const body: Record<string, unknown> = {
      q: `site:quora.com ${query}`,
      num: Math.min(count, 10), // Serper free tier caps at 10
    };
    if (TIME_RANGE_MAP[timeRange]) body.tbs = TIME_RANGE_MAP[timeRange];

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[quora] Serper search failed with status ${res.status}: ${errBody}`);
      return [];
    }
    const data = await res.json();

    const organicCount = data.organic?.length ?? 0;
    console.log(`[quora] Serper returned ${organicCount} organic results`);

    return (data.organic ?? []).map((r: Record<string, unknown>) => ({
      id: `quora-serper-${r.link}`,
      question: ((r.title as string) ?? '').replace(' - Quora', ''),
      url: (r.link as string) ?? '',
      topAnswer: (r.snippet as string) ?? '',
      answerCount: null,
      source: 'serper' as const,
    }));
  } catch (err) {
    console.error('Serper Quora search error:', err);
    return [];
  }
}

/**
 * Gather Quora data from multiple search engines, deduplicate by URL.
 * Main entry point for the platform router.
 */
export async function gatherQuoraData(
  query: string,
  timeRange: string,
  volume: string = 'medium',
): Promise<QuoraSearchResult> {
  const count = volume === 'deep' ? 40 : volume === 'medium' ? 25 : 8;

  // Search both SearXNG and Serper in parallel for maximum coverage
  const [searxngResults, serperResults] = await Promise.allSettled([
    searchSearxngQuora(query, timeRange, count),
    searchSerperQuora(query, timeRange, count),
  ]);

  const allThreads: QuoraThread[] = [];
  const seenUrls = new Set<string>();

  // SearXNG results first
  if (searxngResults.status === 'fulfilled') {
    for (const thread of searxngResults.value) {
      const normalized = thread.url.split('?')[0]; // strip query params
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        allThreads.push(thread);
      }
    }
  }

  // Then Serper results (Google's Quora index is broader)
  if (serperResults.status === 'fulfilled') {
    for (const thread of serperResults.value) {
      const normalized = thread.url.split('?')[0];
      if (!seenUrls.has(normalized)) {
        seenUrls.add(normalized);
        allThreads.push(thread);
      }
    }
  }

  return {
    threads: allThreads,
    totalResults: allThreads.length,
  };
}
