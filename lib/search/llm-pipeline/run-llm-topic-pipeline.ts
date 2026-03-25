import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { computeMetricsFromSerp } from '@/lib/utils/compute-metrics';
import { searchWeb, type WebSearchHit } from '@/lib/search/tools/web-search';
import { fetchUrlText } from '@/lib/search/tools/fetch-url';
import { dedupeUrls, normalizeUrlForMatch } from '@/lib/search/tools/urls';
import { filterTopicSourcesByAllowlist, toAllowlistSet } from '@/lib/search/llm-pipeline/citation-validator';
import { buildMinimalSerpFromHits, guessPlatformFromUrl } from '@/lib/search/llm-pipeline/build-minimal-serp';
import {
  mergerOutputSchema,
  subtopicReportSchema,
  type MergerOutput,
  type SubtopicReport,
} from '@/lib/search/llm-pipeline/schemas';
import { getLlmTopicPipelineLimits } from '@/lib/search/llm-pipeline/limits';
import type {
  PlatformSource,
  ResearchSourceRecord,
  TopicSearchAIResponse,
  TopicSource,
  TrendingTopic,
  VideoIdea,
  SearchMode,
} from '@/lib/types/search';

function logLlmV1(event: Record<string, unknown>) {
  console.log(`[topic_search_llm_v1] ${JSON.stringify(event)}`);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function envModel(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function buildTopicSources(urls: string[], titleByUrl: Map<string, string>): TopicSource[] {
  return urls.map((url) => ({
    url: normalizeUrlForMatch(url),
    title: titleByUrl.get(normalizeUrlForMatch(url)) ?? url,
    type: 'web' as const,
    relevance: 'Cited from web research',
    platform: guessPlatformFromUrl(url),
  }));
}

function toPlatformSources(records: ResearchSourceRecord[]): PlatformSource[] {
  const now = new Date().toISOString();
  return records.map((r, i) => ({
    platform: r.platform ?? guessPlatformFromUrl(r.url),
    id: `llm-${i}-${r.url.slice(-12)}`,
    url: r.url,
    title: r.title,
    content: (r.fetched_text ?? r.snippet ?? '').slice(0, 500),
    author: '',
    engagement: {},
    createdAt: now,
    comments: [],
    transcript: null,
  }));
}

function mapVideoIdeas(raw: MergerOutput['topics'][0]['video_ideas']): VideoIdea[] {
  if (!raw?.length) return [];
  return raw.map((v) => ({
    title: v.title,
    hook: v.hook ?? v.description ?? '',
    format: v.format,
    virality: v.virality,
    why_it_works: v.why_it_works ?? v.description ?? '',
  }));
}

async function researchOneSubtopic(args: {
  parentQuery: string;
  subtopic: string;
  index: number;
  timeRange: string;
  country: string;
  language: string;
  userId: string;
  userEmail?: string;
  researchModel: string;
  maxSearches: number;
  maxFetches: number;
  maxResearchTokens: number;
  searchId?: string;
}): Promise<{
  report: SubtopicReport;
  hits: WebSearchHit[];
  records: ResearchSourceRecord[];
  allowed: string[];
  tokens: number;
  cost: number;
  stageMs: number;
  searchCalls: number;
  fetchCalls: number;
}> {
  const t0 = Date.now();
  const q = `${args.parentQuery} — ${args.subtopic}`;
  const hits = await searchWeb(q, {
    count: args.maxSearches,
    timeRange: args.timeRange,
    country: args.country,
    language: args.language,
  });

  const allowed: string[] = [];
  const titleByUrl = new Map<string, string>();
  for (const h of hits) {
    const u = normalizeUrlForMatch(h.url);
    allowed.push(u);
    titleByUrl.set(u, h.title);
  }

  const fetchedParts: string[] = [];
  const records: ResearchSourceRecord[] = [];
  const fetchLimit = Math.min(hits.length, args.maxFetches);
  for (const h of hits.slice(0, fetchLimit)) {
    const ft = await fetchUrlText(h.url, { maxChars: 8000 });
    const text = ft.ok ? ft.text : h.snippet;
    fetchedParts.push(`URL: ${h.url}\nTitle: ${h.title}\nExcerpt:\n${text.slice(0, 6000)}`);
    records.push({
      url: h.url,
      title: h.title,
      snippet: h.snippet,
      subtopic_index: args.index,
      fetched_text: ft.ok ? text.slice(0, 4000) : undefined,
      platform: guessPlatformFromUrl(h.url),
    });
  }

  const prompt = `You are a research analyst. Based ONLY on the evidence below (web search snippets and page excerpts), produce a JSON object with this exact shape:
{"subtopic":string,"findings":string[] (3-6 bullets),"themes":string[] (optional),"sources":[{"url":string,"title":string,"note":string}],"open_questions":string[] (optional)}
Rules:
- Every finding must be grounded in the evidence. Do not invent statistics.
- sources[].url MUST be chosen from URLs that appear in the evidence block.
- subtopic must be: ${JSON.stringify(args.subtopic)}

Evidence:
${fetchedParts.join('\n\n---\n\n')}`;

  const ai = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: args.maxResearchTokens,
    feature: 'topic_search',
    userId: args.userId,
    userEmail: args.userEmail,
    modelPreference: [args.researchModel],
  });

  const parsed = parseAIResponseJSON<unknown>(ai.text);
  const report = subtopicReportSchema.parse(parsed);
  const stageMs = Date.now() - t0;
  logLlmV1({
    search_id: args.searchId,
    phase: 'subtopic_research',
    subtopic_index: args.index,
    duration_ms: stageMs,
    tokens: ai.usage.totalTokens,
    search_calls: 1,
    fetches: fetchLimit,
    hits_returned: hits.length,
  });
  return {
    report,
    hits,
    records,
    allowed,
    tokens: ai.usage.totalTokens,
    cost: ai.estimatedCost,
    stageMs,
    searchCalls: 1,
    fetchCalls: fetchLimit,
  };
}

export interface RunLlmTopicPipelineResult {
  aiResponse: TopicSearchAIResponse;
  metrics: ReturnType<typeof computeMetricsFromSerp>;
  serpData: ReturnType<typeof buildMinimalSerpFromHits>;
  researchSources: ResearchSourceRecord[];
  platformSources: PlatformSource[];
  totalTokens: number;
  estimatedCost: number;
  /** Persisted to topic_searches.pipeline_state for observability */
  pipelineState: Record<string, unknown>;
}

/**
 * Full LLM tool research path for topic_searches (llm_v1). Caller handles DB lease + auth.
 */
export async function runLlmTopicPipeline(args: {
  searchId?: string;
  search: {
    query: string;
    time_range: string;
    country: string;
    language: string;
    search_mode: SearchMode;
    client_id: string | null;
    subtopics: unknown;
  };
  userId: string;
  userEmail?: string;
  clientContext?: { name: string; industry: string | null; brandVoice: string | null } | null;
}): Promise<RunLlmTopicPipelineResult> {
  const subtopics = Array.isArray(args.search.subtopics)
    ? (args.search.subtopics as string[]).map((s) => s.trim()).filter(Boolean)
    : [];
  if (subtopics.length === 0 || subtopics.length > 5) {
    throw new Error('Subtopics must be a non-empty array (max 5). Confirm subtopics before processing.');
  }

  const limits = getLlmTopicPipelineLimits();
  const researchModel = envModel('TOPIC_SEARCH_RESEARCH_MODEL', 'openai/gpt-4o-mini');
  const mergerModelPref = envModel('TOPIC_SEARCH_MERGER_MODEL', '').trim();

  const stageRows: Array<Record<string, unknown>> = [];

  const allHits: WebSearchHit[] = [];
  const allAllowed: string[] = [];
  const allRecords: ResearchSourceRecord[] = [];
  const subReports: SubtopicReport[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  const indexed = subtopics.map((s, i) => [i, s] as const);
  for (const batch of chunk(indexed, limits.maxParallel)) {
    const results = await Promise.all(
      batch.map(([index, subtopic]) =>
        researchOneSubtopic({
          parentQuery: args.search.query,
          subtopic,
          index,
          timeRange: args.search.time_range,
          country: args.search.country,
          language: args.search.language,
          userId: args.userId,
          userEmail: args.userEmail,
          researchModel,
          maxSearches: limits.maxSearchesPerSubtopic,
          maxFetches: limits.maxFetchesPerSubtopic,
          maxResearchTokens: limits.maxResearchTokens,
          searchId: args.searchId,
        }),
      ),
    );
    for (const r of results) {
      subReports.push(r.report);
      allHits.push(...r.hits);
      allAllowed.push(...r.allowed);
      allRecords.push(...r.records);
      totalTokens += r.tokens;
      totalCost += r.cost;
      stageRows.push({
        phase: 'subtopic_research',
        duration_ms: r.stageMs,
        tokens: r.tokens,
        search_calls: r.searchCalls,
        fetches: r.fetchCalls,
      });
    }
  }

  for (const r of subReports) {
    for (const s of r.sources ?? []) {
      if (s.url) allAllowed.push(normalizeUrlForMatch(s.url));
    }
  }

  const allowSet = toAllowlistSet(dedupeUrls(allAllowed));
  const titleByUrl = new Map<string, string>();
  for (const h of allHits) titleByUrl.set(normalizeUrlForMatch(h.url), h.title);

  const subtopicBlock = subReports
    .map(
      (r, i) =>
        `### Subtopic ${i + 1}: ${r.subtopic}\nFindings:\n${(r.findings ?? []).map((f) => `- ${f}`).join('\n')}\nSources: ${(r.sources ?? []).map((s) => s.url).join(', ')}`,
    )
    .join('\n\n');

  const brandLine =
    args.search.search_mode === 'client_strategy' && args.clientContext
      ? `Client: ${args.clientContext.name}. Industry: ${args.clientContext.industry ?? 'n/a'}. Voice: ${args.clientContext.brandVoice ?? 'n/a'}.`
      : '';

  const mergerPrompt = `You merge subtopic research into one JSON report for "${args.search.query}".
${brandLine}

Subtopic research:
${subtopicBlock}

Return ONLY valid JSON matching:
{
  "summary": "Executive summary of the TOPIC (not a single brand pitch unless client_strategy — then add brand_alignment_notes). 4-6 sentences, Markdown **bold** on key phrases.",
  "brand_alignment_notes": "optional string — only if client_strategy: bridge topic insights to the client brand (2-4 sentences).",
  "overall_sentiment": number -1 to 1,
  "conversation_intensity": "low"|"moderate"|"high"|"very_high",
  "topics": [
    {
      "name": string,
      "why_trending": string,
      "platforms_seen": string[],
      "posts_overview": string,
      "comments_overview": string,
      "source_urls": string[] (each MUST appear in the subtopic research URLs above),
      "video_ideas": [{ "title", "hook", "why_it_works", "format", "virality" }]
    }
  ]
}

Rules:
- 5–10 topics max; each must be distinct.
- source_urls must be from the evidence URLs only.
- If search_mode is general, omit brand_alignment_notes or use null.`;

  const mergeT0 = Date.now();
  const mergerAi = await createCompletion({
    messages: [{ role: 'user', content: mergerPrompt }],
    maxTokens: limits.maxMergerTokens,
    feature: 'topic_search',
    userId: args.userId,
    userEmail: args.userEmail,
    modelPreference: mergerModelPref ? [mergerModelPref] : undefined,
  });

  totalTokens += mergerAi.usage.totalTokens;
  totalCost += mergerAi.estimatedCost;
  const mergeMs = Date.now() - mergeT0;
  logLlmV1({
    search_id: args.searchId,
    phase: 'merge',
    duration_ms: mergeMs,
    tokens: mergerAi.usage.totalTokens,
  });
  stageRows.push({
    phase: 'merge',
    duration_ms: mergeMs,
    tokens: mergerAi.usage.totalTokens,
  });

  let merger: MergerOutput;
  try {
    merger = mergerOutputSchema.parse(parseAIResponseJSON<unknown>(mergerAi.text));
  } catch {
    throw new Error('Merger model returned invalid JSON. Try again.');
  }

  if (args.search.search_mode === 'general') {
    merger = { ...merger, brand_alignment_notes: undefined };
  }

  const trendingTopics: TrendingTopic[] = (merger.topics ?? []).map((t, idx) => {
    const urls = (t.source_urls ?? []).filter((u) => allowSet.has(normalizeUrlForMatch(u)));
    const resonance: TrendingTopic['resonance'] =
      idx === 0 ? 'high' : idx < 3 ? 'medium' : 'low';
    return {
      name: t.name,
      resonance,
      sentiment: merger.overall_sentiment,
      total_engagement: Math.max(100, 500 - idx * 40),
      posts_overview: t.posts_overview,
      comments_overview: t.comments_overview,
      sources: buildTopicSources(urls, titleByUrl),
      video_ideas: mapVideoIdeas(t.video_ideas),
    };
  });

  const emotions = [
    { emotion: 'Interest', percentage: 35, color: '#5ba3e6' },
    { emotion: 'Skepticism', percentage: 20, color: '#a855f7' },
    { emotion: 'Excitement', percentage: 25, color: '#22c55e' },
    { emotion: 'Concern', percentage: 20, color: '#f59e0b' },
  ];

  const content_breakdown = {
    intentions: [
      { name: 'Educational', percentage: 34, engagement_rate: 0.12 },
      { name: 'Debate', percentage: 22, engagement_rate: 0.1 },
      { name: 'Promotional', percentage: 18, engagement_rate: 0.08 },
    ],
    categories: [
      { name: 'News & updates', percentage: 28, engagement_rate: 0.11 },
      { name: 'How-to', percentage: 24, engagement_rate: 0.13 },
    ],
    formats: [
      { name: 'Short video', percentage: 30, engagement_rate: 0.14 },
      { name: 'Article', percentage: 26, engagement_rate: 0.1 },
    ],
  };

  let aiResponse: TopicSearchAIResponse = {
    summary: merger.summary,
    overall_sentiment: merger.overall_sentiment,
    conversation_intensity: merger.conversation_intensity,
    emotions,
    content_breakdown,
    trending_topics: trendingTopics,
    platform_breakdown: [
      { platform: 'web', post_count: allHits.length, comment_count: 0, avg_sentiment: merger.overall_sentiment },
    ],
    conversation_themes: [],
    ...(merger.brand_alignment_notes ? { brand_alignment_notes: merger.brand_alignment_notes } : {}),
  };

  aiResponse = filterTopicSourcesByAllowlist(aiResponse, allowSet);

  const dedupedHits: WebSearchHit[] = [];
  const seenHit = new Set<string>();
  for (const h of allHits) {
    const k = normalizeUrlForMatch(h.url);
    if (seenHit.has(k)) continue;
    seenHit.add(k);
    dedupedHits.push(h);
  }

  const serpData = buildMinimalSerpFromHits(dedupedHits.slice(0, 40));
  const metrics = computeMetricsFromSerp(
    serpData,
    merger.overall_sentiment,
    merger.conversation_intensity,
    aiResponse.trending_topics ?? [],
    allRecords.length,
  );

  const platformSources = toPlatformSources(allRecords);

  const pipelineState = {
    kind: 'llm_v1',
    at: new Date().toISOString(),
    search_id: args.searchId,
    limits,
    stages: stageRows,
    totals: {
      tokens: totalTokens,
      estimated_cost: totalCost,
      subtopics: subtopics.length,
      research_sources: allRecords.length,
    },
  };

  return {
    aiResponse,
    metrics,
    serpData,
    researchSources: allRecords,
    platformSources,
    totalTokens,
    estimatedCost: totalCost,
    pipelineState,
  };
}
