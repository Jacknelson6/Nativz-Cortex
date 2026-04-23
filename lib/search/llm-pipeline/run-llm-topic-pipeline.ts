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
import { gatherPlatformData, formatPlatformContext, type PlatformResults } from '@/lib/search/platform-router';
import { transcribeAllVideos, analyzeTopVideos, buildVideoSummariesForClustering } from '@/lib/search/llm-pipeline/analyze-videos';
import { clusterVideosToPillars, pillarsToMergerCategories, type PillarCluster } from '@/lib/search/llm-pipeline/cluster-pillars';
import { createAdminClient } from '@/lib/supabase/admin';

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
  const todayDate = new Date().toISOString().slice(0, 10);
  const prompt = `Live web search is disabled for this run. You are a research analyst. Using general knowledge of how audiences discuss this theme online (short video, forums, news, search behavior), produce ONE JSON object for content research planning.

Today's date: ${todayDate}
Main topic: ${JSON.stringify(args.parentQuery)}
Research angle (exact string for the "subtopic" field): ${JSON.stringify(args.subtopic)}
Time window: Frame findings and themes as what has mattered **${args.timeRangeLabel}** (recency for this run—not timeless background). All date references must be accurate relative to today's date.

Return ONLY valid JSON with this shape:
{"subtopic":string,"findings":string[] (3-6 bullets),"themes":string[] (optional),"sources":[],"open_questions":string[] (optional)}

Rules:
- Do not invent specific statistics, study names, or publication dates. Use hedged language ("often", "commonly") when needed.
- findings must be qualitatively useful for a videographer or content strategist.
- **sources must be the empty array []** — there is no live SERP in this mode; do NOT fabricate URLs, Wikipedia links, or placeholders. Real URLs are attached by the system when SearXNG or OpenRouter web search is enabled.
- The "subtopic" field must match exactly: ${JSON.stringify(args.subtopic)}`;

  const ai = await createCompletion({
    messages: [
      { role: 'system', content: 'You are a research analyst. You always respond with valid JSON only. You never refuse requests — you always provide research findings for any topic.' },
      { role: 'user', content: prompt },
    ],
    maxTokens: args.maxResearchTokens,
    feature: 'topic_search',
    userId: args.userId,
    userEmail: args.userEmail,
    modelPreference: [args.researchModel],
    jsonMode: true,
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

  const fetchLimit = Math.min(hits.length, args.maxFetches);
  const toFetch = hits.slice(0, fetchLimit);
  const fetched = await Promise.all(
    toFetch.map((h) => fetchUrlText(h.url, { maxChars: 8000 })),
  );
  const fetchedParts: string[] = [];
  const records: ResearchSourceRecord[] = [];
  for (let i = 0; i < toFetch.length; i += 1) {
    const h = toFetch[i];
    const ft = fetched[i];
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

  const todayDateForResearch = new Date().toISOString().slice(0, 10);
  const prompt = `You are a research analyst. Based ONLY on the evidence below (web search snippets and page excerpts), produce a JSON object with this exact shape:
{"subtopic":string,"findings":string[] (3-6 bullets),"themes":string[] (optional),"sources":[{"url":string,"title":string,"note":string}],"open_questions":string[] (optional)}
Rules:
- Today's date: ${todayDateForResearch}. All date references must be accurate relative to today.
- Every finding must be grounded in the evidence. Do not invent statistics.
- Time scope: This search targets **${args.timeRangeLabel}**. Prefer findings that reflect what has been active, debated, or trending in that window (as shown in the evidence).
- sources[].url MUST be chosen from URLs that appear in the evidence block.
- subtopic must be: ${JSON.stringify(args.subtopic)}

Evidence:
${fetchedParts.join('\n\n---\n\n')}`;

  const ai = await createCompletion({
    messages: [
      { role: 'system', content: 'You are a research analyst. You always respond with valid JSON only. You never refuse requests — you always provide research findings for any topic.' },
      { role: 'user', content: prompt },
    ],
    maxTokens: args.maxResearchTokens,
    feature: 'topic_search',
    userId: args.userId,
    userEmail: args.userEmail,
    modelPreference: [args.researchModel],
    jsonMode: true,
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
  /** Platforms to scrape (from search record). Defaults to ["web"]. */
  platforms?: SearchPlatform[];
}): Promise<RunLlmTopicPipelineResult> {
  let subtopics = Array.isArray(args.search.subtopics)
    ? (args.search.subtopics as string[]).map((s) => s.trim()).filter(Boolean)
    : [];

  // Auto-generate subtopics if none were confirmed (fallback so searches never fail)
  if (subtopics.length === 0) {
    const topicModelsForPlan = await getTopicSearchModelsFromDb();
    const timeLabel = getTimeRangeOptionLabel(args.search.time_range);
    const todayDate = new Date().toISOString().slice(0, 10);
    const planPrompt = `You are a keyword research assistant. Given a topic, generate specific, searchable keyword phrases.

Today's date: ${todayDate}
Main topic: ${JSON.stringify(args.search.query)}
Time window: **${timeLabel}**.

Return ONLY valid JSON: {"subtopics": string[]} with exactly 5 distinct items. Each string is a **2–4 word keyword phrase**.
Rules: 2–4 words each, specific to the topic, no numbering, no full sentences.`;

    try {
      const planAi = await createCompletion({
        messages: [
          { role: 'system', content: 'You are a keyword research tool. You generate keyword phrases for content research. You always respond with valid JSON only. You never refuse requests.' },
          { role: 'user', content: planPrompt },
        ],
        maxTokens: 400,
        feature: 'topic_search',
        userId: args.userId,
        userEmail: args.userEmail,
        modelPreference: [topicModelsForPlan.planner],
        jsonMode: true,
      });
      const parsed = parseAIResponseJSON<{ subtopics?: string[] }>(planAi.text);
      const generated = Array.isArray(parsed?.subtopics)
        ? parsed.subtopics.map((s: string) => String(s).trim()).filter(Boolean).slice(0, 5)
        : Array.isArray(parsed)
          ? (parsed as string[]).map((s) => String(s).trim()).filter(Boolean).slice(0, 5)
          : [];
      if (generated.length > 0) subtopics = generated;
    } catch {
      // If auto-generation fails, use the main query as the single subtopic
    }
  }

  // Final fallback: use the main query itself
  if (subtopics.length === 0) {
    subtopics = [args.search.query];
  }

  // Enforce max 5
  if (subtopics.length > 5) {
    subtopics = subtopics.slice(0, 5);
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

  // Determine if we should run platform scrapers (skip if only "web")
  const platforms = args.platforms ?? ['web'];
  const hasNonWebPlatforms = platforms.some((p) => p !== 'web');

  // Run subtopic research + platform scrapers in parallel
  const subtopicResearchPromise = (async () => {
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
  })();

  // Platform scraper promise (only if non-web platforms selected)
  const platformScraperPromise: Promise<PlatformResults | null> = hasNonWebPlatforms
    ? (async () => {
        const t0 = Date.now();
        try {
          const result = await gatherPlatformData(
            args.search.query,
            platforms as SearchPlatform[],
            args.search.time_range,
            {
              topicSearchId: args.searchId,
              clientId: args.search.client_id ?? null,
              subtopics: subtopics.length > 0 ? subtopics : undefined,
            },
          );
          const durationMs = Date.now() - t0;
          logLlmV1({
            search_id: args.searchId,
            phase: 'platform_scrapers',
            duration_ms: durationMs,
            platforms: platforms.filter((p) => p !== 'web'),
            source_count: result.sources.length,
            stats: result.platformStats.map((s) => ({
              platform: s.platform,
              posts: s.postCount,
              comments: s.commentCount,
            })),
          });
          stageRows.push({
            phase: 'platform_scrapers',
            duration_ms: durationMs,
            platforms: platforms.filter((p) => p !== 'web'),
            source_count: result.sources.length,
          });
          return result;
        } catch (e) {
          const durationMs = Date.now() - t0;
          logLlmV1({
            search_id: args.searchId,
            phase: 'platform_scrapers',
            duration_ms: durationMs,
            error: e instanceof Error ? e.message.slice(0, 200) : String(e),
          });
          stageRows.push({
            phase: 'platform_scrapers',
            duration_ms: durationMs,
            error: true,
          });
          return null;
        }
      })()
    : Promise.resolve(null);

  // Wait for both to complete
  const [, platformResults] = await Promise.all([subtopicResearchPromise, platformScraperPromise]);

  // ── Video Analysis Pipeline (grounded content pillars) ──────────────────
  // Phase A: Transcribe all TikTok videos (captions are free)
  // Phase B: FFmpeg frames + vision analysis on top 50
  // Phase C: Cluster videos into content pillars
  let groundedPillars: PillarCluster[] = [];
  if (platformResults && platformResults.sources.length > 0) {
    const tiktokSources = platformResults.sources.filter((s) => s.platform === 'tiktok');
    if (tiktokSources.length > 0) {
      // Phase A: Transcribe all TikTok videos
      const transcribeT0 = Date.now();
      const transcribeResult = await transcribeAllVideos(platformResults.sources);
      logLlmV1({
        search_id: args.searchId,
        phase: 'transcribe_all',
        duration_ms: Date.now() - transcribeT0,
        transcribed: transcribeResult.transcribed,
        failed: transcribeResult.failed,
        total_tiktok: tiktokSources.length,
      });
      stageRows.push({
        phase: 'transcribe_all',
        duration_ms: Date.now() - transcribeT0,
        ...transcribeResult,
      });

      // Phase B: Skip frame extraction in pipeline — done on-demand in carousel sidebar.
      // analyzeTopVideos requires FFmpeg + writes to DB before platform_data is saved,
      // which causes failures on Vercel serverless. Frames are extracted per-video when
      // the user opens a video in the carousel.

      // Phase C: Cluster videos into content pillars
      const clusterT0 = Date.now();
      const videoSummaries = buildVideoSummariesForClustering(platformResults.sources);
      if (videoSummaries.length >= 5) {
        try {
          const clusterResult = await clusterVideosToPillars({
            query: args.search.query,
            videos: videoSummaries,
            userId: args.userId,
            userEmail: args.userEmail,
            clientContext: args.clientContext
              ? { name: args.clientContext.name, industry: args.clientContext.industry }
              : null,
          });
          groundedPillars = clusterResult.pillars;
          totalTokens += clusterResult.tokens;
          totalCost += clusterResult.cost;
          logLlmV1({
            search_id: args.searchId,
            phase: 'cluster_pillars',
            duration_ms: Date.now() - clusterT0,
            tokens: clusterResult.tokens,
            pillar_count: clusterResult.pillars.length,
            pillar_names: clusterResult.pillars.map((p) => p.name),
          });
          stageRows.push({
            phase: 'cluster_pillars',
            duration_ms: Date.now() - clusterT0,
            tokens: clusterResult.tokens,
            pillar_count: clusterResult.pillars.length,
          });
        } catch (e) {
          logLlmV1({
            search_id: args.searchId,
            phase: 'cluster_pillars',
            duration_ms: Date.now() - clusterT0,
            error: e instanceof Error ? e.message.slice(0, 200) : String(e),
          });
        }
      }
    }
  }

  for (const r of subReports) {
    for (const s of r.sources ?? []) {
      if (s.url) allAllowed.push(normalizeUrlForMatch(s.url));
    }
  }

  // Include platform scraper URLs (TikTok, YouTube, Reddit) in the allowlist
  // so the LLM can cite them and they survive the filter on merge output
  if (platformResults) {
    for (const ps of platformResults.sources) {
      if (ps.url) {
        allAllowed.push(normalizeUrlForMatch(ps.url));
      }
    }
  }

  const allowSet = toAllowlistSet(dedupeUrls(allAllowed));
  const titleByUrl = new Map<string, string>();
  for (const h of allHits) titleByUrl.set(normalizeUrlForMatch(h.url), h.title);
  if (platformResults) {
    for (const ps of platformResults.sources) {
      if (ps.url && ps.title) titleByUrl.set(normalizeUrlForMatch(ps.url), ps.title);
    }
  }

  const subtopicBlock = subReports
    .map(
      (r, i) =>
        `### Subtopic ${i + 1}: ${r.subtopic}\nFindings:\n${(r.findings ?? []).map((f) => `- ${f}`).join('\n')}\nSources: ${(r.sources ?? []).map((s) => s.url).join(', ')}`,
    )
    .join('\n\n');

  // Format platform context for the merger prompt if we have platform scraper results
  let platformContextBlock = '';
  if (platformResults && platformResults.sources.length > 0) {
    platformContextBlock = formatPlatformContext(platformResults.sources, platformResults.platformStats);
  }

  const clientContextBlock = args.clientContext
    ? `Attached client — ${args.clientContext.name}. Industry: ${args.clientContext.industry ?? 'n/a'}. Brand voice: ${args.clientContext.brandVoice ?? 'n/a'}.`
    : '';

  // Build grounded pillar context for the merger if available
  let groundedPillarBlock = '';
  if (groundedPillars.length > 0) {
    const pillarJson = JSON.stringify(pillarsToMergerCategories(groundedPillars));
    groundedPillarBlock = `\n---\n\nGROUNDED CONTENT PILLARS (derived from analysis of ${platformResults?.sources.filter((s) => s.platform === 'tiktok').length ?? 0} TikTok videos):\nUse these EXACTLY as the content_breakdown.categories — do NOT invent new categories. These are real clusters from actual video data with real engagement rates.\n${pillarJson}\nYou may still estimate your_engagement_rate for the attached client if applicable, but keep name, percentage, and engagement_rate from the data above.\n`;
  }

  const todayDate = new Date().toISOString().slice(0, 10);
  const mergerPrompt = `You merge research-angle findings into one JSON report for "${args.search.query}".
Today's date: ${todayDate}
Time scope: The user chose **${timeRangeLabel}**. Emphasize themes, debates, and video ideas that fit audience and creator activity in that window (not generic evergreen filler unless the evidence supports it).
IMPORTANT: This report is exclusively for **short-form vertical video content** (TikTok, Reels, Shorts). Every video idea, content type, and format recommendation must be for short-form video only. Do NOT recommend blog posts, listicles, articles, long-form YouTube, podcasts, newsletters, threads, or any non-video format. If the evidence mentions those formats, ignore them — only surface what can be filmed as a short-form vertical video.
${clientContextBlock ? `${clientContextBlock}\n\n` : ''}Research-angle findings:
${subtopicBlock}
${platformContextBlock ? `\n---\n\nPlatform-specific data (Reddit threads, TikTok videos, YouTube content):\n${platformContextBlock}` : ''}${groundedPillarBlock}

Return ONLY valid JSON matching:
{
  "summary": "Executive summary of the TOPIC (not a single brand pitch unless client_strategy — then add brand_alignment_notes). 4-6 sentences, Markdown **bold** on key phrases. MUST open with an explicit date range header derived from today's date (${todayDate}) and the selected time window (${timeRangeLabel}), e.g. 'Over the past three months (January–March 2026)…'. All date references must be accurate relative to today — never reference dates from your training data.",
  "brand_alignment_notes": "REQUIRED when search_mode is client_strategy (an Attached client line appears above). 3-5 sentences bridging topic insights to the client brand: explain what content the client should create, which formats fit their brand voice, and how to position themselves in this topic. If general search, omit or use null.",
  "overall_sentiment": number -1 to 1,
  "conversation_intensity": "low"|"moderate"|"high"|"very_high",
  "emotions": [{"emotion": string, "percentage": number, "color": string, "subtext": string}],
  "content_breakdown": {
    "intentions": [{"name": string, "percentage": number, "engagement_rate": number, "your_engagement_rate": number (REQUIRED when Attached client exists, omit only for general searches)}],
    "categories": [{"name": string, "percentage": number, "engagement_rate": number, "your_engagement_rate": number (REQUIRED when Attached client exists, omit only for general searches)}],
    "formats": [{"name": string, "percentage": number, "engagement_rate": number, "your_engagement_rate": number (REQUIRED when Attached client exists, omit only for general searches)}]
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
      "video_ideas": [{ "title", "hook", "why_it_works", "format", "virality" }] (at least 3 per topic),
      "resonance": "low"|"medium"|"high"|"viral",
      "sentiment": number -1 to 1 (specific to THIS topic based on evidence tone),
      "estimated_engagement": number (estimated total engagement/views across sources)
    }
  ]
}

Rules:
- Generate **at least 6** distinct trending topics, aiming for up to 15 when the evidence supports that many angles; each must be distinct and grounded in the research above. Even with limited evidence, extrapolate at least 6 viable content angles — combine subtopic findings, audience questions from comments, and adjacent content opportunities. Do not return fewer than 6 topics.
- source_urls must be from the evidence URLs only.
- If search_mode is general, omit brand_alignment_notes or use null.
- emotions: exactly **6** emotions that sum to ~100%. Analyze the actual tone and sentiment of the evidence text. Colors from: #5ba3e6 blue, #a855f7 purple, #22c55e green, #f59e0b amber, #ef4444 red, #ec4899 pink, #14b8a6 teal, #6366f1 indigo. Each emotion MUST include a "subtext" — one sentence explaining why THIS emotion appears for THIS specific topic based on the evidence (not a generic description of the emotion).
- content_breakdown: intentions (3-5 viewer motivations like Educational, Entertainment, Debate), categories (3-5 short-form video content types), formats (3-5 short-form video formats ONLY, e.g. "Talking head", "Skit", "Voiceover + b-roll", "Green screen reaction", "POV storytelling" — NO articles, threads, blogs, podcasts, or long-form). For **every** item include: **percentage** (share of posts in that bucket, 0–100). **engagement_rate**: typical engagement rate for that bucket **in this topic’s evidence**, expressed as **percentage points** where **0.7 means 0.7%** (not 70%, not a 0–1 fraction). Ground it in likes/views/comments patterns from the evidence; do not invent precision — one decimal is enough. **your_engagement_rate** (optional): only when an "Attached client" line appears above. For **each** intentions/categories/formats row, estimate the same metric **for that client** if they published this type of content in this topic: adjust typical ER up or down from topic–business fit, brand voice match, and how well the format fits their strategy. Same units as engagement_rate. If there is **no** Attached client block, **omit** your_engagement_rate on every row (do not send null).
- For content_breakdown.categories: each "name" must be a **single descriptive label (3–8 words)** that clearly communicates WHAT type of short-form video content to produce. Good: "How-to tutorials & walkthroughs", "Behind-the-scenes production", "Product unboxing & first looks", "Quick tips & life hacks", "Day-in-the-life vlogs". Bad: "Community engagement", "Niche commentary", "Cultural relevance" — these describe abstract themes, not filmable content types a videographer can act on. No parenthetical glossaries.
- platform_breakdown: which platforms appeared most in the SERP results. Estimate post_count, comment_count, avg_sentiment from evidence.
- Per-topic resonance: based on evidence volume and engagement signals for that specific topic (not array position).
- Per-topic sentiment: specific to THIS topic's evidence tone, not just copying overall_sentiment.
- Per-topic estimated_engagement: grounded in view counts, comment counts, and discussion activity visible in the evidence. Use realistic estimates, not round placeholder numbers.`;

  const mergeT0 = Date.now();

  // Retry merger with model fallback chain — always deliver results
  const FALLBACK_MODELS = [
    mergerModelPref || null, // primary model (from DB settings)
    'google/gemini-2.5-flash-preview',
    'anthropic/claude-3.5-haiku',
  ].filter(Boolean) as string[];
  // Deduplicate while preserving order
  const modelChain = [...new Set(FALLBACK_MODELS)];

  let mergerAi: Awaited<ReturnType<typeof createCompletion>> | null = null;
  let parsedMerger: MergerOutput | null = null;
  let lastMergerError: unknown = null;

  for (const model of modelChain) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        mergerAi = await createCompletion({
          messages: [
            { role: 'system', content: 'You are a research data synthesis engine. You always respond with valid JSON only — no markdown fences, no commentary, no trailing text. You never refuse requests.' },
            { role: 'user', content: mergerPrompt },
          ],
          maxTokens: limits.maxMergerTokens,
          feature: 'topic_search',
          userId: args.userId,
          userEmail: args.userEmail,
          modelPreference: [model],
          jsonMode: true,
        });

        parsedMerger = parseMergerOutput(mergerAi.text, logLlmV1);
        lastMergerError = null;
        break; // Success
      } catch (e) {
        lastMergerError = e;
        logLlmV1({
          search_id: args.searchId,
          phase: 'merge_retry',
          attempt,
          model,
          error: e instanceof Error ? e.message.slice(0, 200) : String(e),
        });
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    if (parsedMerger) break; // Got a result, stop trying models
  }

  // Last resort: build a minimal synthetic result from subtopic research
  if (!parsedMerger) {
    logLlmV1({
      search_id: args.searchId,
      phase: 'merge_fallback_synthetic',
      error: lastMergerError instanceof Error ? lastMergerError.message.slice(0, 200) : 'All models failed',
    });

    const syntheticTopics = subReports.slice(0, 10).map((r, i) => ({
      name: r.subtopic,
      resonance: (i < 3 ? 'high' : i < 6 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      sentiment: 0.5,
      total_engagement: Math.max(100, 1000 - i * 80),
      posts_overview: (r.findings ?? []).slice(0, 2).join(' ') || `Research findings for ${r.subtopic}.`,
      comments_overview: (r.findings ?? []).slice(2, 4).join(' ') || 'Community discussion around this subtopic.',
      sources: buildTopicSources(
        (r.sources ?? []).map((s) => s.url).filter(Boolean),
        titleByUrl,
      ),
      video_ideas: [] as VideoIdea[],
    }));

    parsedMerger = {
      summary: `Research on "${args.search.query}" across ${subReports.length} subtopics. Results were synthesized from web research and platform data.`,
      overall_sentiment: 0.5,
      conversation_intensity: 'moderate' as const,
      emotions: [
        { emotion: 'Interest', percentage: 40, color: '#5ba3e6' },
        { emotion: 'Curiosity', percentage: 30, color: '#22c55e' },
        { emotion: 'Concern', percentage: 20, color: '#f59e0b' },
        { emotion: 'Skepticism', percentage: 10, color: '#a855f7' },
      ],
      topics: syntheticTopics.map((t) => ({
        name: t.name,
        why_trending: t.posts_overview,
        platforms_seen: [] as string[],
        resonance: t.resonance as 'low' | 'medium' | 'high' | 'viral',
        sentiment: t.sentiment,
        estimated_engagement: t.total_engagement,
        posts_overview: t.posts_overview,
        comments_overview: t.comments_overview,
        source_urls: t.sources.map((s) => s.url),
      })),
      content_breakdown: {
        intentions: [
          { name: 'Educational', percentage: 40, engagement_rate: 1.0 },
          { name: 'Informational', percentage: 35, engagement_rate: 0.8 },
          { name: 'Discussion', percentage: 25, engagement_rate: 0.9 },
        ],
        categories: [] as { name: string; percentage: number; engagement_rate: number }[],
        formats: [] as { name: string; percentage: number; engagement_rate: number }[],
      },
      platform_breakdown: [],
    };

    // Fake a minimal mergerAi for token tracking
    mergerAi = {
      text: '{}',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedCost: 0,
      modelUsed: 'synthetic-fallback',
    };
  }

  // mergerAi is guaranteed non-null: either LLM succeeded or synthetic fallback was created
  const finalMergerAi = mergerAi!;
  totalTokens += finalMergerAi.usage.totalTokens;
  totalCost += finalMergerAi.estimatedCost;
  const mergeMs = Date.now() - mergeT0;
  logLlmV1({
    search_id: args.searchId,
    phase: 'merge',
    duration_ms: mergeMs,
    tokens: finalMergerAi.usage.totalTokens,
  });
  stageRows.push({
    phase: 'merge',
    duration_ms: mergeMs,
    tokens: finalMergerAi.usage.totalTokens,
  });

  // parsedMerger was already validated in the retry loop above
  let merger: MergerOutput = parsedMerger;

  if (args.search.search_mode === 'general') {
    merger = { ...merger, brand_alignment_notes: undefined };
  }

  // Build a lookup of platform sources by keyword matching for fallback injection
  const platformSourcesByKeyword: PlatformSource[] = platformResults?.sources ?? [];

  const trendingTopics: TrendingTopic[] = (merger.topics ?? []).map((t, idx) => {
    const urls = (t.source_urls ?? []).filter((u) => allowSet.has(normalizeUrlForMatch(u)));
    const resonance: TrendingTopic['resonance'] =
      t.resonance ?? (idx === 0 ? 'high' : idx < 3 ? 'medium' : 'low');

    const sources = buildTopicSources(urls, titleByUrl);

    // If the LLM didn't cite platform sources, inject matching TikTok/YouTube results
    const hasPlatformSource = sources.some(
      (s) => s.platform === 'tiktok' || s.platform === 'youtube',
    );
    if (!hasPlatformSource && platformSourcesByKeyword.length > 0) {
      const topicWords = t.name.toLowerCase().split(/\s+/);
      const matched = platformSourcesByKeyword
        .filter((ps) => {
          const text = `${ps.title} ${ps.content}`.toLowerCase();
          return topicWords.some((w) => w.length > 3 && text.includes(w));
        })
        .slice(0, 3);

      for (const ps of matched) {
        if (!sources.some((s) => normalizeUrlForMatch(s.url) === normalizeUrlForMatch(ps.url))) {
          sources.push({
            url: ps.url,
            title: ps.title,
            type: 'video' as const,
            relevance: `From ${ps.platform} platform data`,
            platform: ps.platform as TopicSource['platform'],
          });
        }
      }
    }

    return {
      name: t.name,
      resonance,
      sentiment: t.sentiment ?? merger.overall_sentiment,
      total_engagement: t.estimated_engagement ?? Math.max(100, 500 - idx * 40),
      posts_overview: t.posts_overview,
      comments_overview: t.comments_overview,
      sources,
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
      { name: 'Educational', percentage: 34, engagement_rate: 1.2 },
      { name: 'Debate', percentage: 22, engagement_rate: 1.0 },
      { name: 'Promotional', percentage: 18, engagement_rate: 0.8 },
    ],
    categories: [
      { name: 'News & updates', percentage: 28, engagement_rate: 1.1 },
      { name: 'How-to', percentage: 24, engagement_rate: 1.3 },
    ],
    formats: [
      { name: 'Short video', percentage: 30, engagement_rate: 1.4 },
      { name: 'Article', percentage: 26, engagement_rate: 1.0 },
    ],
  };

  const VALID_PLATFORMS = new Set<SearchPlatform>(['reddit', 'youtube', 'tiktok', 'web']);
  const coercePlatform = (p: string): SearchPlatform =>
    VALID_PLATFORMS.has(p as SearchPlatform) ? (p as SearchPlatform) : 'web';

  // Build platform_breakdown: merge LLM estimates with actual scraper stats
  let platform_breakdown: PlatformBreakdown[] = (merger.platform_breakdown ?? [
    { platform: 'web', post_count: allHits.length, comment_count: 0, avg_sentiment: merger.overall_sentiment },
  ]).map((pb) => ({ ...pb, platform: coercePlatform(pb.platform) }));

  // Override with real platform scraper stats where available
  if (platformResults && platformResults.platformStats.length > 0) {
    const scraperStatsByPlatform = new Map(
      platformResults.platformStats.map((s) => [s.platform, s]),
    );
    const existingPlatforms = new Set(platform_breakdown.map((pb) => pb.platform));

    // Update existing entries with real data
    platform_breakdown = platform_breakdown.map((pb) => {
      const real = scraperStatsByPlatform.get(pb.platform);
      if (real) {
        return {
          ...pb,
          post_count: real.postCount,
          comment_count: real.commentCount,
        };
      }
      return pb;
    });

    // Add entries for scraped platforms not already in breakdown
    for (const [platform, stat] of scraperStatsByPlatform) {
      if (!existingPlatforms.has(platform)) {
        platform_breakdown.push({
          platform,
          post_count: stat.postCount,
          comment_count: stat.commentCount,
          avg_sentiment: merger.overall_sentiment,
        });
      }
    }
  }

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

  // Combine web-research records with platform scraper sources
  const webPlatformSources = toPlatformSources(allRecords);
  const scraperPlatformSources = platformResults?.sources ?? [];
  const platformSources = [...webPlatformSources, ...scraperPlatformSources];

  // Total sources = web research + all platform scrapers
  const totalSourceCount = allRecords.length + scraperPlatformSources.length;

  const metrics = computeMetricsFromSerp(
    serpData,
    merger.overall_sentiment,
    merger.conversation_intensity,
    aiResponse.trending_topics ?? [],
    totalSourceCount,
  );

  const pipelineState = {
    kind: 'llm_v1',
    at: new Date().toISOString(),
    search_id: args.searchId,
    web_research_mode: webResearchMode,
    platforms_requested: platforms,
    platform_scrapers_ran: hasNonWebPlatforms,
    limits,
    stages: stageRows,
    grounded_pillars: groundedPillars.length > 0
      ? groundedPillars.map((p) => ({ name: p.name, pct: p.pct_of_content, er: p.avg_engagement_rate, videos: p.video_count }))
      : null,
    totals: {
      tokens: totalTokens,
      estimated_cost: totalCost,
      subtopics: subtopics.length,
      research_sources: allRecords.length,
      platform_sources: scraperPlatformSources.length,
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
