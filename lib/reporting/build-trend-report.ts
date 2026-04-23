import { searxngSearch } from '@/lib/serp/client';
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
 * Run a lightweight SERP + LLM summarization pass for a trend-monitoring
 * subscription. Designed to fit comfortably inside a 300s cron: single
 * SearXNG query + a single LLM call. Falls back gracefully when SearXNG
 * or the LLM is unavailable.
 */
export async function buildTrendReportData(params: BuildTrendParams): Promise<TrendReportData> {
  const query = buildQuery(params);
  const timeRange = cadenceToTimeRange(params.cadence);

  // 1. Fetch web results from SearXNG. If SearXNG is unreachable we fall
  //    back to an empty list — the report still generates with a note.
  const rawResults: Array<{
    url: string;
    title: string;
    content: string;
    engine: string;
    publishedDate?: string;
  }> = [];

  try {
    const response = await searxngSearch(query, { timeRange });
    rawResults.push(...(response.results ?? []).slice(0, 25));
  } catch (err) {
    console.error('[trend-report] searxng failed', err);
  }

  // 2. Normalize into mentions + tag with keyword/brand hits + sentiment.
  const seenUrls = new Set<string>();
  const mentions: TrendReportMention[] = [];
  for (const r of rawResults) {
    if (!r.url || seenUrls.has(r.url)) continue;
    seenUrls.add(r.url);
    const text = `${r.title} ${r.content}`;
    const matchedBrands = matchList(text, params.brandNames);
    const matchedKeywords = matchList(text, params.keywords);
    mentions.push({
      url: r.url,
      title: r.title ?? r.url,
      snippet: (r.content ?? '').slice(0, 280),
      engine: r.engine ?? 'unknown',
      source_domain: extractDomain(r.url),
      publishedDate: r.publishedDate ?? null,
      matchedBrands,
      matchedKeywords,
      sentimentGuess: guessSentiment(text, params.brandNames),
    });
  }

  // 3. Buckets + findings.
  const findings: TrendReportFindings = {
    total_mentions: mentions.length,
    brand_buckets: params.brandNames.map((brand) => {
      const hits = mentions.filter((m) => m.matchedBrands.includes(brand));
      return {
        brand_name: brand,
        mention_count: hits.length,
        top_urls: hits.slice(0, 5).map((h) => h.url),
      };
    }),
    keyword_buckets: params.keywords.map((keyword) => {
      const hits = mentions.filter((m) => m.matchedKeywords.includes(keyword));
      return {
        keyword,
        mention_count: hits.length,
        top_urls: hits.slice(0, 5).map((h) => h.url),
      };
    }),
    top_mentions: mentions.slice(0, 10),
    themes: [],
  };

  // 4. LLM summary + theme extraction. If the LLM fails we still ship the
  //    email with a stub summary.
  let summary = '';
  try {
    const llmOut = await summarizeFindings(params, findings);
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
): Promise<{ summary: string; themes: string[] }> {
  if (findings.total_mentions === 0) {
    return {
      summary: `No notable mentions found for ${params.topicQuery} during this period. The monitor continues to listen.`,
      themes: [],
    };
  }

  const topMentionsText = findings.top_mentions
    .slice(0, 8)
    .map((m, i) => `${i + 1}. [${m.source_domain}] ${m.title}\n   ${m.snippet}`)
    .join('\n');

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

Here are the top web mentions this period:

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
