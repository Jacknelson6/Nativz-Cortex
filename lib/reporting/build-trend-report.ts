import { searchWebSearxng } from '@/lib/search/tools/web-search';
import { fetchUrlText } from '@/lib/search/tools/fetch-url';
import { dedupeUrls, normalizeUrlForMatch } from '@/lib/search/tools/urls';
import { createCompletion } from '@/lib/ai/client';
import type {
  TrendReportCadence,
  TrendReportData,
  TrendReportFindings,
  TrendReportMention,
} from './trend-report-types';

const CADENCE_DAYS: Record<TrendReportCadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

/** How many SERP hits we ask Apify for per run. */
const SERP_LIMIT = 25;

/** How many of those hits we enrich with a real URL fetch. Each fetch is
 *  ~12KB and ~12s timeout; parallelised. Keep this tight so the cron fits
 *  in the 300s budget even with many subscriptions. */
const FETCH_ENRICH_COUNT = 6;

export function nextTrendRunAt(from: Date, cadence: TrendReportCadence): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + CADENCE_DAYS[cadence]);
  return d;
}

export function trendPeriodStartFor(end: Date, cadence: TrendReportCadence): Date {
  const d = new Date(end);
  d.setUTCDate(d.getUTCDate() - CADENCE_DAYS[cadence]);
  return d;
}

function cadenceToTimeRange(cadence: TrendReportCadence): string {
  return cadence === 'weekly' ? 'last_7_days' : 'last_30_days';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function matchList(haystack: string, needles: string[]): string[] {
  if (!haystack) return [];
  const lower = haystack.toLowerCase();
  return needles.filter((n) => n && lower.includes(n.toLowerCase()));
}

function guessSentiment(
  text: string,
  brandNames: string[],
): 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown' {
  const lower = text.toLowerCase();
  // Crude signal only — the LLM summary is where nuance lives. This is just
  // to colour-code individual mentions in the email digest.
  const positive = /(love|great|amazing|excellent|best|recommend|fan of|impressed|solid)/.test(lower);
  const negative = /(hate|worst|terrible|awful|avoid|scam|ripoff|bad|broken|issue|problem|complaint)/.test(lower);
  if (positive && negative) return 'mixed';
  if (positive) return 'positive';
  if (negative) return 'negative';
  if (brandNames.some((b) => lower.includes(b.toLowerCase()))) return 'neutral';
  return 'unknown';
}

interface BuildTrendParams {
  subscriptionId: string;
  subscriptionName: string;
  clientId: string | null;
  clientName: string;
  clientAgency: string;
  organizationId: string | null;
  topicQuery: string;
  keywords: string[];
  brandNames: string[];
  platforms: string[];
  cadence: TrendReportCadence;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Run the brand-listening retrieval + summarisation pipeline for a single
 * subscription. Reuses the Trend Finder stack end-to-end:
 *
 *   1. `searchWebSearxng` — Google SERP via Apify scraperlink (same actor
 *      Trend Finder uses for topic research).
 *   2. `fetchUrlText`     — deepen the top N results with actual page text
 *      so the LLM summarises real content, not SERP snippets.
 *   3. `createCompletion` — OpenRouter (admin-configured model) for the
 *      summary + theme extraction.
 *
 * Graceful fallbacks at every step: Apify down → empty mentions; fetch
 * timeouts → snippet only; LLM error → canned summary. Report always ships.
 */
export async function buildTrendReportData(params: BuildTrendParams): Promise<TrendReportData> {
  const query = buildQuery(params);
  const timeRange = cadenceToTimeRange(params.cadence);

  // 1. Apify Google SERP via the shared Trend Finder abstraction. Returns
  //    normalised WebSearchHit[] { url, title, snippet }.
  let hits: Array<{ url: string; title: string; snippet: string }> = [];
  try {
    hits = await searchWebSearxng(query, { count: SERP_LIMIT, timeRange });
  } catch (err) {
    console.error('[trend-report] Apify SERP failed', err);
  }

  // 2. Deepen the top N hits with fetchUrlText. Parallelised. Falls back to
  //    the SERP snippet if the fetch times out or returns non-OK.
  const enrichUrls = dedupeUrls(hits.slice(0, FETCH_ENRICH_COUNT).map((h) => h.url));
  const fetchedByUrl = new Map<string, string>();
  await Promise.all(
    enrichUrls.map(async (url) => {
      const res = await fetchUrlText(url, { maxChars: 4000, timeoutMs: 10_000 });
      if (res.ok && res.text) fetchedByUrl.set(normalizeUrlForMatch(url), res.text);
    }),
  );

  // 3. Normalise into mentions + tag with keyword/brand hits + sentiment.
  const seenUrls = new Set<string>();
  const mentions: TrendReportMention[] = [];
  for (const h of hits) {
    if (!h.url) continue;
    const normalized = normalizeUrlForMatch(h.url);
    if (seenUrls.has(normalized)) continue;
    seenUrls.add(normalized);

    const fetched = fetchedByUrl.get(normalized);
    // Content used for match + sentiment prefers fetched page text over the
    // SERP snippet; snippet stays displayed in the email for readability.
    const matchText = `${h.title} ${fetched ?? h.snippet}`;
    const matchedBrands = matchList(matchText, params.brandNames);
    const matchedKeywords = matchList(matchText, params.keywords);
    mentions.push({
      url: h.url,
      title: h.title ?? h.url,
      snippet: (h.snippet ?? '').slice(0, 280),
      engine: 'google',
      source_domain: extractDomain(h.url),
      publishedDate: null,
      matchedBrands,
      matchedKeywords,
      sentimentGuess: guessSentiment(matchText, params.brandNames),
    });
  }

  // 4. Buckets + findings.
  const findings: TrendReportFindings = {
    total_mentions: mentions.length,
    brand_buckets: params.brandNames.map((brand) => {
      const hitsForBrand = mentions.filter((m) => m.matchedBrands.includes(brand));
      return {
        brand_name: brand,
        mention_count: hitsForBrand.length,
        top_urls: hitsForBrand.slice(0, 5).map((h) => h.url),
      };
    }),
    keyword_buckets: params.keywords.map((keyword) => {
      const hitsForKw = mentions.filter((m) => m.matchedKeywords.includes(keyword));
      return {
        keyword,
        mention_count: hitsForKw.length,
        top_urls: hitsForKw.slice(0, 5).map((h) => h.url),
      };
    }),
    top_mentions: mentions.slice(0, 10),
    themes: [],
  };

  // 5. LLM summary + theme extraction. Feeds fetched content when available.
  let summary = '';
  try {
    const llmOut = await summarizeFindings(params, findings, fetchedByUrl);
    summary = llmOut.summary;
    findings.themes = llmOut.themes;
  } catch (err) {
    console.error('[trend-report] llm summary failed', err);
    summary = fallbackSummary(params, findings);
  }

  return {
    subscription_id: params.subscriptionId,
    subscription_name: params.subscriptionName,
    client_id: params.clientId,
    client_name: params.clientName,
    client_agency: params.clientAgency,
    organization_id: params.organizationId,
    topic_query: params.topicQuery,
    keywords: params.keywords,
    brand_names: params.brandNames,
    platforms: params.platforms,
    cadence: params.cadence,
    period_start: params.periodStart.toISOString(),
    period_end: params.periodEnd.toISOString(),
    summary,
    findings,
    generated_at: new Date().toISOString(),
  };
}

function buildQuery(params: BuildTrendParams): string {
  const parts: string[] = [];
  parts.push(params.topicQuery);
  if (params.brandNames.length) {
    parts.push(`(${params.brandNames.map((b) => `"${b}"`).join(' OR ')})`);
  }
  if (params.keywords.length) {
    parts.push(`(${params.keywords.map((k) => `"${k}"`).join(' OR ')})`);
  }
  return parts.join(' ');
}

function fallbackSummary(params: BuildTrendParams, findings: TrendReportFindings): string {
  if (findings.total_mentions === 0) {
    return `No notable mentions of ${params.topicQuery} found in this period. The monitor will keep watching.`;
  }
  const brandHits = findings.brand_buckets.reduce((acc, b) => acc + b.mention_count, 0);
  return `Found ${findings.total_mentions} mentions relevant to ${params.topicQuery} this period, with ${brandHits} direct brand references. Review the mentions below for context.`;
}

async function summarizeFindings(
  params: BuildTrendParams,
  findings: TrendReportFindings,
  fetchedByUrl: Map<string, string>,
): Promise<{ summary: string; themes: string[] }> {
  if (findings.total_mentions === 0) {
    return {
      summary: `No notable mentions found for ${params.topicQuery} during this period. The monitor continues to listen.`,
      themes: [],
    };
  }

  const topMentionsText = findings.top_mentions
    .slice(0, 8)
    .map((m, i) => {
      const normalized = normalizeUrlForMatch(m.url);
      const fetched = fetchedByUrl.get(normalized);
      // Feed the LLM the enriched page content when we have it — this is
      // the whole point of the fetchUrlText pass. Cap each chunk so the
      // prompt stays well under the model's context.
      const body = fetched ? fetched.slice(0, 1500) : m.snippet;
      return `${i + 1}. [${m.source_domain}] ${m.title}\n   ${body}`;
    })
    .join('\n\n');

  const brandContext = params.brandNames.length
    ? `Listen specifically for mentions of: ${params.brandNames.join(', ')}.`
    : '';
  const keywordContext = params.keywords.length
    ? `Flag these keywords when they come up: ${params.keywords.join(', ')}.`
    : '';

  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a concise trend-monitoring analyst. You summarize what people are currently saying about a topic or brand across the web, reading like a sharper-than-usual agency briefing. Stick to 2-3 short paragraphs. Never fabricate.',
    },
    {
      role: 'user' as const,
      content: `Topic: ${params.topicQuery}
${brandContext}
${keywordContext}

Period: ${params.periodStart.toISOString().slice(0, 10)} → ${params.periodEnd.toISOString().slice(0, 10)} (${params.cadence}).

Here are the top web mentions this period (snippets drawn from the actual page content where available):

${topMentionsText}

Write a short summary (2-3 paragraphs) of what people are saying. Then provide 3-5 short themes as a JSON array under a "themes" key.

Respond as JSON matching this shape exactly:
{"summary": "…", "themes": ["…", "…"]}`,
    },
  ];

  const result = await createCompletion({
    messages,
    maxTokens: 900,
    feature: 'trend_report_summary',
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(result.text) as { summary?: string; themes?: string[] };
    return {
      summary: parsed.summary ?? fallbackSummary(params, findings),
      themes: Array.isArray(parsed.themes) ? parsed.themes.slice(0, 6) : [],
    };
  } catch {
    return { summary: result.text.slice(0, 1200), themes: [] };
  }
}
