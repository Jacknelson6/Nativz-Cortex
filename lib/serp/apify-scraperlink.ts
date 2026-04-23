/**
 * Google SERP via Apify scraperlink/google-search-results-serp-scraper.
 *
 * Replaces SearXNG as the topic-search web research layer. SearXNG needed a
 * self-hosted instance (localhost-only), which never worked in production.
 *
 * Actor docs: https://apify.com/scraperlink/google-search-results-serp-scraper
 * Input schema (from actor docs 2026-04-23):
 *   keyword  — required, search term
 *   limit    — 10 | 20 | 30 | 40 | 50 | 100 (per page)
 *   page     — page number (default 1)
 *   country  — auto-sets proxy_location and gl (default "US")
 *   gl       — ISO 3166 A-2 (localized results)
 *   hl       — Google UI language (e.g. "en")
 *   tbs      — time filter, e.g. "qdr:d" (day) | "qdr:w" (week) | "qdr:m" (month) | "qdr:y" (year)
 *              or custom "cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY"
 *   proxy_location — "us" | "ca" | etc. (default "us")
 */

import {
  startApifyActorRun,
  waitForApifyRunSuccess,
  fetchApifyDatasetItems,
} from '@/lib/tiktok/apify-run';
import { recordApifyRun } from '@/lib/apify/record-run';
import type { SerpData } from './types';

const DEFAULT_ACTOR = 'scraperlink/google-search-results-serp-scraper';

function getActorId(): string {
  return (process.env.APIFY_GOOGLE_SERP_ACTOR_ID ?? DEFAULT_ACTOR).trim();
}

/** Map Cortex time_range → Google's `tbs` param. 3mo/6mo have no native slot. */
function mapTimeRangeToTbs(timeRange: string | undefined): string | undefined {
  switch (timeRange) {
    case 'last_7_days':    return 'qdr:w';
    case 'last_30_days':   return 'qdr:m';
    case 'last_3_months':  return 'qdr:m';   // closest — Google has no 3mo
    case 'last_6_months':  return 'qdr:y';   // closest — Google has no 6mo
    case 'last_year':      return 'qdr:y';
    default: return undefined;
  }
}

/** Allowed `limit` values per actor docs (string-typed). Caller picks closest ≥ requested. */
function quantizeLimit(n: number): '10' | '20' | '30' | '40' | '50' | '100' {
  if (n <= 10) return '10';
  if (n <= 20) return '20';
  if (n <= 30) return '30';
  if (n <= 40) return '40';
  if (n <= 50) return '50';
  return '100';
}

interface ScraperlinkOrganicRow {
  position?: number;
  title?: string;
  url?: string;
  link?: string;
  description?: string;
  snippet?: string;
  date?: string;
}

/**
 * Scraperlink emits one dataset row per page, each wrapping a `results`
 * array of organic rows. Flatten + dedupe by URL.
 */
function parseOrganic(items: unknown[]): SerpData['webResults'] {
  const seen = new Set<string>();
  const out: SerpData['webResults'] = [];

  for (const raw of items) {
    const row = raw as Record<string, unknown>;
    const results = Array.isArray(row.results)
      ? (row.results as ScraperlinkOrganicRow[])
      : Array.isArray(row.organicResults)
        ? (row.organicResults as ScraperlinkOrganicRow[])
        : [row as ScraperlinkOrganicRow];

    for (const o of results) {
      const url = String(o.url ?? o.link ?? '');
      const title = String(o.title ?? '');
      if (!url || !title) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        url,
        title,
        description: String(o.description ?? o.snippet ?? ''),
      });
    }
  }

  return out;
}

export async function gatherSerpDataViaApify(
  query: string,
  options: {
    timeRange?: string;
    limit?: number;
    country?: string;
    runContext?: { topicSearchId?: string | null; clientId?: string | null };
  } = {},
): Promise<SerpData | null> {
  const apiKey = process.env.APIFY_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[serp] APIFY_API_KEY not set — skipping web SERP');
    return null;
  }

  const actorId = getActorId();
  const limit = quantizeLimit(options.limit ?? 30);
  const tbs = mapTimeRangeToTbs(options.timeRange);

  const input: Record<string, unknown> = {
    keyword: query,
    limit,
    country: options.country ?? 'US',
    hl: 'en',
    proxy_location: 'us',
  };
  if (tbs) input.tbs = tbs;

  const runId = await startApifyActorRun(actorId, input, apiKey);
  if (!runId) {
    await recordApifyRun({
      runId: '',
      actorId,
      apiKey,
      context: { purpose: 'web_serp', ...(options.runContext ?? {}) },
      startFailure: { error: `Actor ${actorId} failed to start` },
    });
    return null;
  }

  const ok = await waitForApifyRunSuccess(runId, apiKey, 90_000, 3000);

  await recordApifyRun({
    runId,
    actorId,
    apiKey,
    context: { purpose: 'web_serp', ...(options.runContext ?? {}) },
  });

  if (!ok) return null;

  const items = await fetchApifyDatasetItems(runId, apiKey, Math.max(200, Number(limit)));
  const webResults = parseOrganic(items);

  // `discussions` + `videos` intentionally empty — richer equivalents live in
  // platform_data.sources (Reddit via trudax, TikTok/YouTube via their own
  // scrapers). See CLAUDE.md + docs/search-results-overhaul.md for rationale.
  return {
    webResults,
    discussions: [],
    videos: [],
  };
}
