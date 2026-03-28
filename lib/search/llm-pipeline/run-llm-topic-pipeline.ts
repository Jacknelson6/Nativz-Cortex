import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { parseMergerOutput } from '@/lib/search/llm-pipeline/merge-normalize';
import { computeMetricsFromSerp } from '@/lib/utils/compute-metrics';
import { searchWebSearxng, searchWebOpenRouter, type WebSearchHit } from '@/lib/search/tools/web-search';
import { fetchUrlText } from '@/lib/search/tools/fetch-url';
import { dedupeUrls, normalizeUrlForMatch } from '@/lib/search/tools/urls';
import { filterTopicSourcesByAllowlist, toAllowlistSet } from '@/lib/search/llm-pipeline/citation-validator';
import { buildMinimalSerpFromHits, guessPlatformFromUrl } from '@/lib/search/llm-pipeline/build-minimal-serp';
import {
  subtopicReportSchema,
  type MergerOutput,
  type SubtopicReport,
} from '@/lib/search/llm-pipeline/schemas';
import { getLlmTopicPipelineLimits } from '@/lib/search/llm-pipeline/limits';
import {
  getTopicSearchRefineQueryModel,
  getTopicSearchRefineSerpQueryEnabled,
  getTopicSearchWebResearchMode,
} from '@/lib/config/topic-search-web-research';
import { refineSerpQueryWithLlm } from '@/lib/search/llm-pipeline/refine-serp-query';
import { getTopicSearchModelsFromDb } from '@/lib/ai/topic-search-models';
import {
  getTimeRangeOptionLabel,
  type PlatformBreakdown,
  type PlatformSource,
  type ResearchSourceRecord,
  type SearchPlatform,
  type TopicSearchAIResponse,
  type TopicSource,
  type TrendingTopic,
  type VideoIdea,
  type SearchMode,
} from '@/lib/types/search';

function logLlmV1(event: Record<string, unknown>) {
  console.log(`[topic_search_llm_v1] ${JSON.stringify(event)}`);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

async function researchOneSubtopicLlmOnly(args: {
  parentQuery: string;
  subtopic: string;
  index: number;
  userId: string;
  userEmail?: string;
  researchModel: string;
  maxResearchTokens: number;
  searchId?: string;
  /** e.g. "Last 3 months" — findings should reflect this recency window */
  timeRangeLabel: string;
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
  const prompt = `Live web search is disabled for this run. You are a research analyst. Using general knowledge of how audiences discuss this theme online (short video, forums, news, search behavior), produce ONE JSON object for content research planning.

Main topic: ${JSON.stringify(args.parentQuery)}
Research angle (exact string for the "subtopic" field): ${JSON.stringify(args.subtopic)}
Time window: Frame findings and themes as what has mattered **${args.timeRangeLabel}** (recency for this run—not timeless background).

Return ONLY valid JSON with this shape:
{"subtopic":string,"findings":string[] (3-6 bullets),"themes":string[] (optional),"sources":[],"open_questions":string[] (optional)}

Rules:
- Do not invent specific statistics, study names, or publication dates. Use hedged language ("often", "commonly") when needed.
- findings must be qualitatively useful for a videographer or content strategist.
- **sources must be the empty array []** — there is no live SERP in this mode; do NOT fabricate URLs, Wikipedia links, or placeholders. Real URLs are attached by the system when SearXNG or OpenRouter web search is enabled.
- The "subtopic" field must match exactly: ${JSON.stringify(args.subtopic)}`;

  const ai = await createCompletion({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: args.maxResearchTokens,
    feature: 'topic_search',
    userId: args.userId,
    userEmail: args.userEmail,
    modelPreference: [args.researchModel],
  });

  const parsed = parseAIResponseJSON<unknown>(ai.text);
  const parsedReport = subtopicReportSchema.parse(parsed);
  /** Never persist LLM-suggested URLs in no-SERP mode (avoids fake Wikipedia / example.com in "Specific sources"). */
  const report: SubtopicReport = { ...parsedReport, sources: [] };

  const records: ResearchSourceRecord[] = [];
  const allowed: string[] = [];
  const hits: WebSearchHit[] = [];

  const stageMs = Date.now() - t0;
  logLlmV1({
    search_id: args.searchId,
    phase: 'subtopic_research',
    subtopic_index: args.index,
    duration_ms: stageMs,
    tokens: ai.usage.totalTokens,
    web_research: 'llm_only',
    search_calls: 0,
    fetches: 0,
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
    searchCalls: 0,
    fetchCalls: 0,
  };
}

async function researchOneSubtopicWithLiveSerp(args: {
  parentQuery: string;
  subtopic: string;
  index: number;
  timeRange: string;
  timeRangeLabel: string;
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
  const serpMode = getTopicSearchWebResearchMode();
  let q = `${args.parentQuery} — ${args.subtopic}`;
  let hits: WebSearchHit[] = [];
  let serpTokens = 0;
  let serpCost = 0;
  let refineTokens = 0;
  let refineCost = 0;

  if (serpMode === 'llm_only') {
    return researchOneSubtopicLlmOnly({
      parentQuery: args.parentQuery,
      subtopic: args.subtopic,
      index: args.index,
      userId: args.userId,
      userEmail: args.userEmail,
      researchModel: args.researchModel,
      maxResearchTokens: args.maxResearchTokens,
      searchId: args.searchId,
      timeRangeLabel: args.timeRangeLabel,
    });
  }

  if (getTopicSearchRefineSerpQueryEnabled()) {
    const refined = await refineSerpQueryWithLlm({
      parentQuery: args.parentQuery,
      subtopic: args.subtopic,
      timeRangeLabel: args.timeRangeLabel,
      userId: args.userId,
      userEmail: args.userEmail,
      researchModel: args.researchModel,
      refineModel: getTopicSearchRefineQueryModel(),
    });
    q = refined.query;
    refineTokens = refined.tokens;
    refineCost = refined.cost;
    logLlmV1({
      search_id: args.searchId,
      phase: 'serp_query_refine',
      subtopic_index: args.index,
      tokens: refined.tokens,
      serp_mode: serpMode,
    });
  }

  const isConnectionError = (e: unknown): boolean => {
    if (!(e instanceof Error)) return false;
    const msg = e.message.toLowerCase();
    return msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('fetch failed');
  };

  try {
    if (serpMode === 'searxng') {
      hits = await searchWebSearxng(q, {
        count: args.maxSearches,
        timeRange: args.timeRange,
        country: args.country,
        language: args.language,
      });
    } else {
      const res = await searchWebOpenRouter(q, {
        count: args.maxSearches,
        timeRange: args.timeRange,
        country: args.country,
        language: args.language,
        userId: args.userId,
        userEmail: args.userEmail,
      });
      hits = res.hits;
      serpTokens = res.usage.totalTokens;
      serpCost = res.usage.estimatedCost;
    }
  } catch (e) {
    // Only fall back to llm_only if the search service is actually unreachable
    if (isConnectionError(e)) {
      logLlmV1({
        search_id: args.searchId,
        subtopic_index: args.index,
        serp_fallback: 'llm_only',
        serp_mode: serpMode,
        reason: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
      return researchOneSubtopicLlmOnly({
        parentQuery: args.parentQuery,
        subtopic: args.subtopic,
        index: args.index,
        userId: args.userId,
        userEmail: args.userEmail,
        researchModel: args.researchModel,
        maxResearchTokens: args.maxResearchTokens,
        searchId: args.searchId,
        timeRangeLabel: args.timeRangeLabel,
      });
    }
    // Non-connection errors: log warning but don't silently downgrade
    logLlmV1({
      search_id: args.searchId,
      subtopic_index: args.index,
      serp_error: true,
      serp_mode: serpMode,
      reason: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
    throw e;
  }

  // On empty results, retry with broader query (parent query only) before giving up
  if (hits.length === 0 && q !== args.parentQuery) {
    logLlmV1({
      search_id: args.searchId,
      subtopic_index: args.index,
      no_serp_hits: true,
      serp_mode: serpMode,
      retry_broader: true,
    });
    try {
      if (serpMode === 'searxng') {
        hits = await searchWebSearxng(args.parentQuery, {
          count: args.maxSearches,
          timeRange: args.timeRange,
          country: args.country,
          language: args.language,
        });
      } else {
        const res = await searchWebOpenRouter(args.parentQuery, {
          count: args.maxSearches,
          timeRange: args.timeRange,
          country: args.country,
          language: args.language,
          userId: args.userId,
          userEmail: args.userEmail,
        });
        hits = res.hits;
        serpTokens += res.usage.totalTokens;
        serpCost += res.usage.estimatedCost;
      }
    } catch {
      // Broader retry failed — continue with empty hits
    }
  }

  if (hits.length === 0) {
    logLlmV1({
      search_id: args.searchId,
      subtopic_index: args.index,
      no_serp_hits: true,
      serp_mode: serpMode,
      falling_back: 'llm_only',
    });
    return researchOneSubtopicLlmOnly({
      parentQuery: args.parentQuery,
      subtopic: args.subtopic,
      index: args.index,
      userId: args.userId,
      userEmail: args.userEmail,
      researchModel: args.researchModel,
      maxResearchTokens: args.maxResearchTokens,
      searchId: args.searchId,
      timeRangeLabel: args.timeRangeLabel,
    });
  }

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
- Time scope: This search targets **${args.timeRangeLabel}**. Prefer findings that reflect what has been active, debated, or trending in that window (as shown in the evidence).
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
    tokens: ai.usage.totalTokens + serpTokens + refineTokens,
    web_research: serpMode,
    search_calls: 1,
    fetches: fetchLimit,
    hits_returned: hits.length,
  });
  return {
    report,
    hits,
    records,
    allowed,
    tokens: ai.usage.totalTokens + serpTokens + refineTokens,
    cost: ai.estimatedCost + serpCost + refineCost,
    stageMs,
    searchCalls: 1,
    fetchCalls: fetchLimit,
  };
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
  const timeRangeLabel = getTimeRangeOptionLabel(args.timeRange);
  if (getTopicSearchWebResearchMode() === 'llm_only') {
    return researchOneSubtopicLlmOnly({
      parentQuery: args.parentQuery,
      subtopic: args.subtopic,
      index: args.index,
      userId: args.userId,
      userEmail: args.userEmail,
      researchModel: args.researchModel,
      maxResearchTokens: args.maxResearchTokens,
      searchId: args.searchId,
      timeRangeLabel,
    });
  }
  return researchOneSubtopicWithLiveSerp({ ...args, timeRangeLabel });
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

  const timeRangeLabel = getTimeRangeOptionLabel(args.search.time_range);

  const webResearchMode = getTopicSearchWebResearchMode();
  const limits = getLlmTopicPipelineLimits();
  const topicModels = await getTopicSearchModelsFromDb();
  const researchModel = topicModels.research;
  const mergerModelPref = topicModels.merger.trim();

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

  const mergerPrompt = `You merge research-angle findings into one JSON report for "${args.search.query}".
Time scope: The user chose **${timeRangeLabel}**. Emphasize themes, debates, and video ideas that fit audience and creator activity in that window (not generic evergreen filler unless the evidence supports it).
${brandLine}

Research-angle findings:
${subtopicBlock}

Return ONLY valid JSON matching:
{
  "summary": "Executive summary of the TOPIC (not a single brand pitch unless client_strategy — then add brand_alignment_notes). 4-6 sentences, Markdown **bold** on key phrases.",
  "brand_alignment_notes": "optional string — only if client_strategy: bridge topic insights to the client brand (2-4 sentences).",
  "overall_sentiment": number -1 to 1,
  "conversation_intensity": "low"|"moderate"|"high"|"very_high",
  "emotions": [{"emotion": string, "percentage": number, "color": string}],
  "content_breakdown": {
    "intentions": [{"name": string, "percentage": number, "engagement_rate": number}],
    "categories": [{"name": string, "percentage": number, "engagement_rate": number}],
    "formats": [{"name": string, "percentage": number, "engagement_rate": number}]
  },
  "platform_breakdown": [{"platform": string, "post_count": number, "comment_count": number, "avg_sentiment": number}],
  "topics": [
    {
      "name": string,
      "why_trending": string,
      "platforms_seen": string[],
      "posts_overview": string,
      "comments_overview": string,
      "source_urls": string[] (each MUST appear in the subtopic research URLs above),
      "video_ideas": [{ "title", "hook", "why_it_works", "format", "virality" }],
      "resonance": "low"|"medium"|"high"|"viral",
      "sentiment": number -1 to 1 (specific to THIS topic based on evidence tone),
      "estimated_engagement": number (estimated total engagement/views across sources)
    }
  ]
}

Rules:
- 5–10 topics max; each must be distinct.
- source_urls must be from the evidence URLs only.
- If search_mode is general, omit brand_alignment_notes or use null.
- emotions: 5-8 emotions that sum to ~100%. Analyze the actual tone and sentiment of the evidence text. Colors from: #5ba3e6 blue, #a855f7 purple, #22c55e green, #f59e0b amber, #ef4444 red, #ec4899 pink, #14b8a6 teal, #6366f1 indigo.
- content_breakdown: intentions (3-5 viewer motivations like Educational, Entertainment, Debate), categories (3-5 content types like News, How-to, Opinion), formats (3-5 like Short video, Article, Thread). Each with percentage and engagement_rate (0-1). Derive from what the evidence actually shows.
- platform_breakdown: which platforms appeared most in the SERP results. Estimate post_count, comment_count, avg_sentiment from evidence.
- Per-topic resonance: based on evidence volume and engagement signals for that specific topic (not array position).
- Per-topic sentiment: specific to THIS topic's evidence tone, not just copying overall_sentiment.
- Per-topic estimated_engagement: grounded in view counts, comment counts, and discussion activity visible in the evidence. Use realistic estimates, not round placeholder numbers.`;

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
    merger = parseMergerOutput(mergerAi.text, logLlmV1);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : 'Merger model returned invalid JSON. Try again.';
    throw new Error(msg);
  }

  if (args.search.search_mode === 'general') {
    merger = { ...merger, brand_alignment_notes: undefined };
  }

  const trendingTopics: TrendingTopic[] = (merger.topics ?? []).map((t, idx) => {
    const urls = (t.source_urls ?? []).filter((u) => allowSet.has(normalizeUrlForMatch(u)));
    const resonance: TrendingTopic['resonance'] =
      t.resonance ?? (idx === 0 ? 'high' : idx < 3 ? 'medium' : 'low');
    return {
      name: t.name,
      resonance,
      sentiment: t.sentiment ?? merger.overall_sentiment,
      total_engagement: t.estimated_engagement ?? Math.max(100, 500 - idx * 40),
      posts_overview: t.posts_overview,
      comments_overview: t.comments_overview,
      sources: buildTopicSources(urls, titleByUrl),
      video_ideas: mapVideoIdeas(t.video_ideas),
    };
  });

  const emotions = merger.emotions ?? [
    { emotion: 'Interest', percentage: 35, color: '#5ba3e6' },
    { emotion: 'Skepticism', percentage: 20, color: '#a855f7' },
    { emotion: 'Excitement', percentage: 25, color: '#22c55e' },
    { emotion: 'Concern', percentage: 20, color: '#f59e0b' },
  ];

  const content_breakdown = merger.content_breakdown ?? {
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

  const VALID_PLATFORMS = new Set<SearchPlatform>(['reddit', 'youtube', 'tiktok', 'web', 'quora']);
  const coercePlatform = (p: string): SearchPlatform =>
    VALID_PLATFORMS.has(p as SearchPlatform) ? (p as SearchPlatform) : 'web';

  const platform_breakdown: PlatformBreakdown[] = (merger.platform_breakdown ?? [
    { platform: 'web', post_count: allHits.length, comment_count: 0, avg_sentiment: merger.overall_sentiment },
  ]).map((pb) => ({ ...pb, platform: coercePlatform(pb.platform) }));

  let aiResponse: TopicSearchAIResponse = {
    summary: merger.summary,
    overall_sentiment: merger.overall_sentiment,
    conversation_intensity: merger.conversation_intensity,
    emotions,
    content_breakdown,
    trending_topics: trendingTopics,
    platform_breakdown,
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
    web_research_mode: webResearchMode,
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
