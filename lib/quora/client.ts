// lib/quora/client.ts — Quora data gathering via Brave Search discussions endpoint
//
// Quora has no public API and actively blocks scrapers.
// Strategy: use Brave Search to find Quora threads + Google Serper for extra coverage.
// This gives us questions, answers, and engagement signals without scraping.

export interface QuoraThread {
  id: string;
  question: string;
  url: string;
  topAnswer: string;
  answerCount: number | null;
  source: 'brave' | 'serper';
}

export interface QuoraSearchResult {
  threads: QuoraThread[];
  totalResults: number;
}

const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1/web/search';

const FRESHNESS_MAP: Record<string, string> = {
  last_7_days: 'pw',
  last_30_days: 'pm',
  last_3_months: 'py',
  last_6_months: 'py',
  last_year: 'py',
};

/**
 * Search Brave for Quora discussions specifically.
 */
async function searchBraveQuora(query: string, timeRange: string, count: number): Promise<QuoraThread[]> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!braveKey) {
    console.warn('[quora] No BRAVE_SEARCH_API_KEY — skipping Brave search');
    return [];
  }

  try {
    const braveHeaders = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': braveKey,
    };

    // Run searches sequentially to avoid Brave 429 rate limits.
    // Use "quora" keyword query — Brave's discussions section naturally surfaces Quora threads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const braveResults: (any | null)[] = [];

    // First: keyword search (better than site: which suppresses discussions section)
    try {
      const res = await fetch(`${BRAVE_API_BASE}?${new URLSearchParams({
        q: `${query} quora answers`,
        count: String(count),
      })}`, {
        headers: braveHeaders,
        signal: AbortSignal.timeout(10000),
      });
      braveResults.push(res.ok ? await res.json() : null);
      if (!res.ok) console.warn(`[quora] Brave quora search failed: ${res.status}`);
    } catch (err) {
      console.error('[quora] Brave search error:', err);
      braveResults.push(null);
    }

    const threads: QuoraThread[] = [];
    const seenUrls = new Set<string>();

    // Process results
    for (const data of braveResults) {
      if (!data) continue;

      const discussionCount = data.discussions?.results?.length ?? 0;
      const webResultCount = data.web?.results?.length ?? 0;
      console.log(`[quora] Brave response — discussions: ${discussionCount}, web results: ${webResultCount}`);

      // Check discussions first (better structured data — has answer counts, top comments)
      for (const d of data.discussions?.results ?? []) {
        if (!d.url?.includes('quora.com') || seenUrls.has(d.url)) continue;
        seenUrls.add(d.url);
        threads.push({
          id: `quora-brave-${d.url}`,
          question: d.title ?? '',
          url: d.url,
          topAnswer: d.top_comment ?? d.description ?? '',
          answerCount: d.num_answers ?? null,
          source: 'brave',
        });
      }

      // Also check web results for Quora pages
      for (const r of data.web?.results ?? []) {
        if (!r.url?.includes('quora.com') || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);
        threads.push({
          id: `quora-brave-${r.url}`,
          question: r.title?.replace(' - Quora', '') ?? '',
          url: r.url,
          topAnswer: r.description ?? '',
          answerCount: null,
          source: 'brave',
        });
      }
    }

    console.log(`[quora] Total Brave threads found: ${threads.length}`);
    return threads;
  } catch (err) {
    console.error('[quora] Brave search error:', err);
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

  // Search both Brave and Serper in parallel for maximum coverage
  const [braveResults, serperResults] = await Promise.allSettled([
    searchBraveQuora(query, timeRange, count),
    searchSerperQuora(query, timeRange, count),
  ]);

  const allThreads: QuoraThread[] = [];
  const seenUrls = new Set<string>();

  // Brave results first (better discussion metadata)
  if (braveResults.status === 'fulfilled') {
    for (const thread of braveResults.value) {
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
