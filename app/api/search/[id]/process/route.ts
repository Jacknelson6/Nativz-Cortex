import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTopicResearchPrompt } from '@/lib/prompts/topic-research';
import { buildClientStrategyPrompt } from '@/lib/prompts/client-strategy';
import { buildNarrativePrompt } from '@/lib/prompts/narrative-prompt';
import { gatherSerpData } from '@/lib/serp/client';
import { gatherPlatformData, formatPlatformContext } from '@/lib/search/platform-router';
import { computeAnalytics } from '@/lib/search/analytics-engine';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { computeMetricsFromSerp } from '@/lib/utils/compute-metrics';
import { normalizeSyntheticAudiences } from '@/lib/search/synthetic-audiences';
import type {
  TopicSearch,
  TopicSearchAIResponse,
  SearchPlatform,
  TrendingTopic,
  TopicSource,
} from '@/lib/types/search';
import type { SerpData } from '@/lib/serp/types';
import type { ClientPreferences } from '@/lib/types/database';
import { syncSearchToVault } from '@/lib/vault/sync';
import { createNotification } from '@/lib/notifications/create';
import { notifyTopicSearchFailedOnce } from '@/lib/topic-search/ops-notify';
import { runLlmTopicPipeline } from '@/lib/search/llm-pipeline/run-llm-topic-pipeline';
import { cloneJsonForPostgres } from '@/lib/utils/json-for-postgres';
import { assertUserCanAccessTopicSearch } from '@/lib/api/topic-search-access';

/** Vercel Pro / Fluid can use 800s — heavy multi-platform runs often exceed 5 minutes. */
export const maxDuration = 800;

/** How long a processing lease is considered active before another worker may reclaim (ms). */
const PROCESS_LEASE_MS = 15 * 60 * 1000;

/**
 * Build a set of all URLs present in the SERP data for validation.
 */
function buildSerpUrlSet(serpData: SerpData): Set<string> {
  const urls = new Set<string>();
  for (const r of serpData.webResults) urls.add(r.url);
  for (const d of serpData.discussions) urls.add(d.url);
  for (const v of serpData.videos) urls.add(v.url);
  return urls;
}

/**
 * Strip any AI-cited URLs that don't exist in the original SERP data.
 */
function validateTopicSources(
  aiResponse: TopicSearchAIResponse,
  serpUrls: Set<string>
): TopicSearchAIResponse {
  return {
    ...aiResponse,
    trending_topics: (aiResponse.trending_topics ?? []).map(topic => ({
      ...topic,
      sources: (topic.sources ?? []).filter(source => serpUrls.has(source.url)),
      video_ideas: topic.video_ideas ?? [],
    })),
  };
}

/**
 * POST /api/search/[id]/process
 *
 * Hybrid pipeline:
 * 1. Gather data from all platforms in parallel
 * 2. Compute structured analytics in code (sentiment, emotions, topics, breakdown)
 * 3. Call LLM ONLY for narrative summary + video ideas (smaller, simpler JSON)
 * 4. Merge code-computed structure with LLM narrative
 * 5. Save results
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const access = await assertUserCanAccessTopicSearch(adminClient, user.id, id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status === 404 ? 404 : 403 },
      );
    }
    const search = access.search as unknown as TopicSearch;

    if (search.status === 'completed') {
      return NextResponse.json({ status: 'completed' });
    }

    if (search.status !== 'processing' && search.status !== 'failed') {
      return NextResponse.json({ error: 'Search is not in processing state' }, { status: 400 });
    }

    // If retrying a failed search, reset to processing first
    if (search.status === 'failed') {
      await adminClient
        .from('topic_searches')
        .update({ status: 'processing', processing_started_at: null, summary: null })
        .eq('id', id);
    }

    // Single-flight: one active pipeline per search (extra POSTs from refresh/tabs get 202 + poll).
    const leaseNow = new Date().toISOString();
    const staleBefore = new Date(Date.now() - PROCESS_LEASE_MS).toISOString();

    const { data: claimedFresh } = await adminClient
      .from('topic_searches')
      .update({ processing_started_at: leaseNow, status: 'processing' })
      .eq('id', id)
      .in('status', ['processing', 'failed'])
      .is('processing_started_at', null)
      .select('id');

    let claimed = !!(claimedFresh && claimedFresh.length > 0);

    if (!claimed) {
      const { data: claimedStale } = await adminClient
        .from('topic_searches')
        .update({ processing_started_at: leaseNow })
        .eq('id', id)
        .eq('status', 'processing')
        .lt('processing_started_at', staleBefore)
        .select('id');
      claimed = !!(claimedStale && claimedStale.length > 0);
    }

    if (!claimed) {
      const { data: latest } = await adminClient
        .from('topic_searches')
        .select('status')
        .eq('id', id)
        .single();
      if (latest?.status === 'completed') {
        return NextResponse.json({ status: 'completed' });
      }
      return NextResponse.json({ status: 'processing' }, { status: 202 });
    }

    // Fetch optional client context + brand preferences
    let clientContext = null;
    let brandPreferences: ClientPreferences | null = null;
    if (search.client_id) {
      const { data: client } = await adminClient
        .from('clients')
        .select('name, industry, target_audience, brand_voice, topic_keywords, website_url, preferences')
        .eq('id', search.client_id)
        .single();

      if (client) {
        clientContext = {
          name: client.name,
          industry: client.industry,
          targetAudience: client.target_audience,
          brandVoice: client.brand_voice,
          topicKeywords: client.topic_keywords,
          websiteUrl: client.website_url,
        };
        brandPreferences = (client.preferences as ClientPreferences) || null;
      }
    }

    // Read platforms/volume from the search record
    const platforms: string[] = search.platforms ?? ['web'];
    const volume: string = search.volume ?? 'medium';
    const isV2 = platforms.length > 1 || platforms.includes('reddit') || platforms.includes('quora');

    try {
      const topicPipeline = (search as { topic_pipeline?: string }).topic_pipeline ?? 'legacy';
      if (topicPipeline === 'llm_v1') {
        const MAX_RETRIES = 3;
        let lastError: Error | null = null;
        let result: Awaited<ReturnType<typeof runLlmTopicPipeline>> | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            result = await runLlmTopicPipeline({
          searchId: id,
          search: {
            query: search.query,
            time_range: search.time_range,
            country: search.country,
            language: search.language,
            search_mode: ((search as { search_mode?: string }).search_mode ?? 'general') as
              | 'general'
              | 'client_strategy',
            client_id: search.client_id,
            subtopics: (search as { subtopics?: unknown }).subtopics,
          },
          userId: user.id,
          userEmail: user.email ?? undefined,
          clientContext: clientContext
            ? {
                name: clientContext.name,
                industry: clientContext.industry,
                brandVoice: clientContext.brandVoice,
              }
            : null,
          platforms: platforms as import('@/lib/types/search').SearchPlatform[],
          volume,
        });
            // Success — break out of retry loop
            lastError = null;
            break;
          } catch (retryErr) {
            lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
            console.error(`[process] LLM pipeline attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
            if (attempt < MAX_RETRIES) {
              // Wait 2s before retrying
              await new Promise((r) => setTimeout(r, 2000));
            }
          }
        }

        if (!result || lastError) {
          const msg = lastError?.message ?? 'Pipeline failed after retries';
          await adminClient
            .from('topic_searches')
            .update({
              status: 'failed',
              processing_started_at: null,
              summary: `Search failed after ${MAX_RETRIES} attempts: ${msg}`,
            })
            .eq('id', id);
          await notifyTopicSearchFailedOnce(adminClient, id);
          return NextResponse.json(
            { error: 'Search failed', details: msg },
            { status: 500 },
          );
        }

        // Ensure all jsonb fields are valid (Supabase rejects null/undefined in jsonb columns)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const safeJson = (v: any, fallback: any): any =>
          v !== null && v !== undefined ? v : fallback;

        // Build prioritized platform sources (TikTok first)
        const mapSource = (s: import('@/lib/types/search').PlatformSource) => ({
          platform: s.platform,
          id: s.id,
          url: s.url,
          title: (s.title ?? '').slice(0, 300),
          content: (s.content ?? '').slice(0, 300),
          author: s.author,
          thumbnailUrl: s.thumbnailUrl ?? null,
          videoFormat: s.videoFormat ?? null,
          engagement: s.engagement,
          createdAt: s.createdAt,
          transcript: s.transcript ? s.transcript.slice(0, 300) : null,
          comments: [],
        });

        const allPlatformSources = result.platformSources ?? [];
        const tiktokSources = allPlatformSources.filter((s) => s.platform === 'tiktok');
        const youtubeSources = allPlatformSources.filter((s) => s.platform === 'youtube');
        const otherSources = allPlatformSources.filter((s) => s.platform !== 'tiktok' && s.platform !== 'youtube');
        const allPrioritized = [...tiktokSources, ...youtubeSources, ...otherSources];

        // First 10 go in batch 1, remaining 40 in batch 2
        const batch1Sources = allPrioritized.slice(0, 10).map(mapSource);
        const batch2Sources = allPrioritized.slice(10, 50).map(mapSource);

        // Save in two batches to avoid PostgREST payload size limits.
        // Batch 1: core results + 10 platform source previews
        const { error: batch1Err } = await adminClient
          .from('topic_searches')
          .update({
            status: 'completed',
            processing_started_at: null,
            summary: result.aiResponse.summary || 'No summary generated.',
            metrics: cloneJsonForPostgres(safeJson(result.metrics, {})),
            emotions: cloneJsonForPostgres(safeJson(result.aiResponse.emotions, {})),
            content_breakdown: cloneJsonForPostgres(safeJson(result.aiResponse.content_breakdown, {})),
            trending_topics: cloneJsonForPostgres(safeJson(result.aiResponse.trending_topics, [])),
            raw_ai_response: cloneJsonForPostgres(safeJson(result.aiResponse, {})),
            platform_data: cloneJsonForPostgres({
              stats: [],
              sourceCount: allPlatformSources.length,
              sources: batch1Sources,
            }),
            tokens_used: result.totalTokens ?? 0,
            estimated_cost: result.estimatedCost ?? 0,
            completed_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (batch1Err) {
          console.error('[process] llm_v1 batch1 save failed:', batch1Err);
          // Try minimal save so user at least sees a completed search
          await adminClient
            .from('topic_searches')
            .update({
              status: 'completed',
              processing_started_at: null,
              summary: result.aiResponse.summary || 'Results saved with reduced data.',
              trending_topics: cloneJsonForPostgres(safeJson(result.aiResponse.trending_topics, [])),
              tokens_used: result.totalTokens ?? 0,
              completed_at: new Date().toISOString(),
            })
            .eq('id', id);
        }

        // Batch 2: remaining 40 platform sources, serp data, research sources, pipeline state
        if (batch2Sources.length > 0 || result.serpData || result.researchSources) {
          await adminClient
            .from('topic_searches')
            .update({
              serp_data: cloneJsonForPostgres(
                safeJson(result.serpData, { webResults: [], discussions: [], videos: [] }),
              ),
              research_sources: cloneJsonForPostgres(safeJson(result.researchSources, [])),
              pipeline_state: cloneJsonForPostgres(safeJson(result.pipelineState, {})),
              // Merge remaining sources into platform_data
              platform_data: cloneJsonForPostgres({
                stats: [],
                sourceCount: allPlatformSources.length,
                sources: [...batch1Sources, ...batch2Sources],
              }),
            })
            .eq('id', id)
            .then(({ error: batch2Err }) => {
              if (batch2Err) {
                console.error('[process] llm_v1 batch2 save failed (non-critical):', batch2Err.message);
                // Save just pipeline state if platform_data is too large
                adminClient
                  .from('topic_searches')
                  .update({
                    pipeline_state: cloneJsonForPostgres(safeJson(result.pipelineState, {})),
                  })
                  .eq('id', id)
                  .then(() => {});
              }
            });
        }

        // Persist platform video sources to topic_search_videos for the Sources grid
        if (result.platformSources && result.platformSources.length > 0) {
          const videoRows = result.platformSources
            .filter((s) => s.platform === 'tiktok' || s.platform === 'youtube')
            .map((s) => ({
              search_id: id,
              platform: s.platform,
              platform_id: s.id,
              url: s.url,
              title: (s.title ?? '').slice(0, 500),
              author_username: s.author || null,
              thumbnail_url: s.thumbnailUrl ?? null,
              views: s.engagement?.views ?? 0,
              likes: s.engagement?.likes ?? 0,
              comments: s.engagement?.comments ?? 0,
              publish_date: s.createdAt || null,
            }));

          if (videoRows.length > 0) {
            // Insert in batches to avoid payload limits
            const BATCH = 100;
            for (let i = 0; i < videoRows.length; i += BATCH) {
              await adminClient
                .from('topic_search_videos')
                .upsert(videoRows.slice(i, i + BATCH), { onConflict: 'search_id,platform,platform_id' })
                .then(({ error: vidErr }) => {
                  if (vidErr) console.error('[process] video persist batch error:', vidErr.message);
                });
            }
          }
        }

        syncSearchToVault(
          {
            ...search,
            status: 'completed',
            summary: result.aiResponse.summary,
            metrics: result.metrics,
            emotions: result.aiResponse.emotions,
            content_breakdown: result.aiResponse.content_breakdown,
            trending_topics: result.aiResponse.trending_topics,
            raw_ai_response: result.aiResponse,
            serp_data: result.serpData,
            tokens_used: result.totalTokens,
            estimated_cost: result.estimatedCost,
            completed_at: new Date().toISOString(),
          },
          clientContext?.name,
        ).catch(() => {});

        createNotification({
          recipientUserId: user.id,
          type: 'search_completed',
          title: 'Search completed',
          body: `Results ready for "${search.query}"`,
          linkPath: `/admin/search/${id}`,
        }).catch(() => {});

        return NextResponse.json({ status: 'completed' });
      }

      // ── Step 1: Gather data (legacy) ───────────────────────────────────────
      let serpData: SerpData;
      let platformContext = '';
      let platformSources: import('@/lib/types/search').PlatformSource[] = [];
      let platformStats: { platform: SearchPlatform; postCount: number; commentCount: number; topSubreddits?: string[]; topChannels?: string[]; topHashtags?: string[] }[] = [];

      if (isV2) {
        const platformResults = await gatherPlatformData(
          search.query,
          platforms as SearchPlatform[],
          search.time_range,
          volume as 'light' | 'medium' | 'deep',
        );
        serpData = platformResults.serpData ?? { webResults: [], discussions: [], videos: [] };
        platformContext = formatPlatformContext(platformResults.sources, platformResults.platformStats);
        platformSources = platformResults.sources;
        platformStats = platformResults.platformStats;

        // Store raw platform data + sources for display (TikTok embeds, etc.)
        await adminClient
          .from('topic_searches')
          .update({
            platform_data: cloneJsonForPostgres({
              stats: platformResults.platformStats,
              sourceCount: platformResults.sources.length,
              sources: platformResults.sources.map(s => ({
                platform: s.platform,
                id: s.id,
                url: s.url,
                title: s.title,
                content: s.content.substring(0, 500),
                author: s.author,
                subreddit: s.subreddit,
                thumbnailUrl: s.thumbnailUrl ?? null,
                videoFormat: s.videoFormat ?? null,
                engagement: s.engagement,
                createdAt: s.createdAt,
                comments: s.comments.slice(0, 5),
                transcript: s.transcript?.substring(0, 1000) ?? null,
              })),
            }),
          })
          .eq('id', id);
      } else {
        serpData = await gatherSerpData(search.query, {
          timeRange: search.time_range,
          country: search.country,
          language: search.language,
          source: search.source,
        });
      }

      // ── Step 2: Compute analytics in code (no LLM) ────────────────────────
      const analytics = computeAnalytics(platformSources, serpData, platformStats, search.query);

      // ── Step 3: Fetch knowledge base context for client searches ───────────
      let clientKnowledgeBlock: string | null = null;
      if (search.client_id) {
        try {
          const { getBrandProfile, getKnowledgeEntries } = await import('@/lib/knowledge/queries');
          const [brandProfile, entries] = await Promise.all([
            getBrandProfile(search.client_id),
            getKnowledgeEntries(search.client_id),
          ]);

          const parts: string[] = [];
          if (brandProfile) {
            parts.push(`### Brand Profile\n${brandProfile.content.substring(0, 2000)}`);
          }

          const products = new Set<string>();
          const people = new Set<string>();
          const faqs: string[] = [];
          for (const entry of entries) {
            const meta = entry.metadata as Record<string, unknown> | null;
            const entities = meta?.entities as {
              people?: { name: string; role?: string }[];
              products?: { name: string; description?: string }[];
              faqs?: { question: string; answer: string }[];
            } | undefined;
            if (!entities) continue;
            for (const p of entities.people ?? []) people.add(p.role ? `${p.name} (${p.role})` : p.name);
            for (const p of entities.products ?? []) products.add(p.description ? `${p.name}: ${p.description}` : p.name);
            for (const f of entities.faqs ?? []) faqs.push(`Q: ${f.question}\nA: ${f.answer}`);
          }

          if (products.size > 0) parts.push(`### Products & Services\n${[...products].join('\n')}`);
          if (people.size > 0) parts.push(`### Key People\n${[...people].join(', ')}`);
          if (faqs.length > 0) parts.push(`### FAQs\n${faqs.slice(0, 5).join('\n\n')}`);

          const meetings = entries.filter((e) => e.type === 'meeting_note').slice(0, 3);
          if (meetings.length > 0) {
            parts.push(`### Recent Meeting Insights\n${meetings.map((m) => `- ${m.title}: ${m.content.substring(0, 200)}...`).join('\n')}`);
          }

          if (parts.length > 0) {
            clientKnowledgeBlock = parts.join('\n\n');
          }
        } catch {
          // Non-blocking
        }
      }

      // ── Step 4: Call LLM for topic discovery + narrative + video ideas ─────
      const timeLabel = search.time_range.replace(/_/g, ' ').replace('last ', 'last ');
      const narrativePrompt = buildNarrativePrompt({
        query: search.query,
        timeRange: timeLabel,
        analytics,
        platformContext: platformContext || undefined,
        clientName: clientContext?.name,
        clientIndustry: clientContext?.industry,
        brandVoice: clientContext?.brandVoice,
      });

      const aiResult = await createCompletion({
        messages: [{ role: 'user', content: narrativePrompt }],
        maxTokens: 9000, // Narrative + synthetic audiences + video ideas
        feature: 'topic_search',
        userId: user.id,
        userEmail: user.email ?? undefined,
      });

      // Parse the LLM response (now includes topic discovery)
      let narrative: {
        summary: string;
        synthetic_audiences?: unknown;
        topics: {
          name: string;
          why_trending: string;
          platforms_seen: string[];
          posts_overview: string;
          comments_overview: string;
          video_ideas: TopicSearchAIResponse['trending_topics'][0]['video_ideas'];
        }[];
      };
      try {
        narrative = parseAIResponseJSON(aiResult.text);
      } catch (parseErr) {
        console.error('[process] LLM JSON parse failed:', parseErr instanceof Error ? parseErr.message : parseErr);
        console.error('[process] LLM raw response (first 500 chars):', aiResult.text.substring(0, 500));
        // If LLM JSON still fails, try to extract summary text from the raw response
        let fallbackSummary = `Analysis of "${search.query}" across ${platformSources.length} sources.`;
        const raw = aiResult.text;
        // Try to extract "summary" value from partial JSON
        const summaryMatch = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (summaryMatch) {
          fallbackSummary = summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
        } else if (!raw.startsWith('{')) {
          // If it's plain text (not JSON), use it directly
          fallbackSummary = raw.substring(0, 500);
        }
        // Try to extract topics from partial JSON even if full parse failed
        const topicMatches = raw.matchAll(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
        const extractedTopicNames = [...topicMatches].map(m => m[1].replace(/\\"/g, '"'));
        const fallbackTopics = extractedTopicNames
          .filter(name => name.length > 3 && name.length < 80)
          .slice(0, 15)
          .map(name => ({
            name,
            why_trending: '',
            platforms_seen: [] as string[],
            posts_overview: '',
            comments_overview: '',
            video_ideas: [] as TopicSearchAIResponse['trending_topics'][0]['video_ideas'],
          }));

        console.log(`[process] Extracted ${fallbackTopics.length} topic names from partial JSON: ${fallbackTopics.map(t => t.name).join(', ')}`);

        narrative = {
          summary: fallbackSummary,
          topics: fallbackTopics,
          synthetic_audiences: undefined,
        };
      }

      // ── Step 5: Merge LLM-discovered topics with code-computed analytics ───
      const serpUrls = buildSerpUrlSet(serpData);

      // LLM topics are the PRIMARY source — enrich with code-computed engagement data
      // Total engagement across all sources for relative scoring
      const totalSearchEngagement = platformSources.reduce((sum, s) => {
        return sum + (s.engagement.views ?? 0) + (s.engagement.likes ?? 0) * 10 + (s.engagement.comments ?? 0) * 5 + (s.engagement.score ?? 0) * 2;
      }, 0);
      const avgEngagementPerTopic = totalSearchEngagement / Math.max(narrative.topics?.length ?? 1, 1);

      const trendingTopics: TrendingTopic[] = (narrative.topics ?? []).map((llmTopic, idx) => {
        // Try fuzzy matching: check if any code-extracted topic name appears within the LLM topic name (or vice versa)
        const llmNameLower = llmTopic.name.toLowerCase();
        const codeTopic = analytics.extracted_topics.find(t => {
          const codeNameLower = t.name.toLowerCase();
          return codeNameLower === llmNameLower ||
            llmNameLower.includes(codeNameLower) ||
            codeNameLower.split(' ').every(word => llmNameLower.includes(word));
        });

        const sentiment = codeTopic?.avgSentiment ?? analytics.overall_sentiment;
        const sources = codeTopic?.sources.filter(s => serpUrls.has(s.url) || s.platform !== 'web') ?? [];

        // Assign resonance based on platform presence + position in LLM ranking
        // LLM lists topics roughly by importance, so use position as a signal
        const platformCount = (llmTopic.platforms_seen ?? []).length;
        const positionBoost = Math.max(0, narrative.topics!.length - idx); // higher for earlier topics
        const engagementEstimate = codeTopic?.totalEngagement ?? (avgEngagementPerTopic * (1 + positionBoost * 0.2));
        const resonanceScore = platformCount * 3 + positionBoost * 2 + Math.log10(Math.max(engagementEstimate, 1));

        const resonance: 'low' | 'medium' | 'high' | 'viral' =
          resonanceScore > 20 ? 'viral' :
          resonanceScore > 14 ? 'high' :
          resonanceScore > 8 ? 'medium' : 'low';

        return {
          name: llmTopic.name,
          resonance,
          sentiment,
          total_engagement: Math.max(0, Math.round(engagementEstimate)),
          posts_overview: llmTopic.posts_overview ?? `Trending topic across ${(llmTopic.platforms_seen ?? []).join(', ')}.`,
          comments_overview: llmTopic.comments_overview ?? `${llmTopic.why_trending ?? 'Active discussion across platforms.'}`,
          sources,
          video_ideas: llmTopic.video_ideas ?? [],
        };
      });

      // If LLM returned no topics, fall back to code-extracted topics
      if (trendingTopics.length === 0) {
        for (const topic of analytics.extracted_topics.slice(0, 15)) {
          trendingTopics.push({
            name: topic.name,
            resonance: computeResonance(topic.frequency, topic.totalEngagement),
            sentiment: topic.avgSentiment,
            total_engagement: Math.max(0, Math.round(topic.totalEngagement)),
            posts_overview: `Found in ${topic.frequency} sources across ${Array.from(topic.platforms).join(', ')} with ${topic.totalEngagement.toLocaleString()} total engagement.`,
            comments_overview: `Sentiment is ${topic.avgSentiment > 0.2 ? 'positive' : topic.avgSentiment < -0.2 ? 'negative' : 'mixed'} based on comment analysis.`,
            sources: topic.sources.filter(s => serpUrls.has(s.url) || s.platform !== 'web'),
            video_ideas: [],
          });
        }
      }

      // Assemble the full AI response in the existing format (backward compatible)
      const syntheticAudiences = normalizeSyntheticAudiences(narrative.synthetic_audiences);

      const aiResponse: TopicSearchAIResponse = {
        summary: (narrative.summary && !narrative.summary.startsWith('{'))
          ? narrative.summary
          : `Analysis of "${search.query}" across ${platformSources.length} sources from ${platforms.length} platforms.`,
        overall_sentiment: analytics.overall_sentiment,
        conversation_intensity: analytics.conversation_intensity,
        emotions: analytics.emotions,
        content_breakdown: analytics.content_breakdown,
        trending_topics: trendingTopics,
        big_movers: analytics.big_movers,
        platform_breakdown: analytics.platform_breakdown,
        conversation_themes: analytics.conversation_themes,
        ...(syntheticAudiences ? { synthetic_audiences: syntheticAudiences } : {}),
      };

      // ── Step 6: Compute display metrics ────────────────────────────────────
      const metrics = computeMetricsFromSerp(
        serpData,
        analytics.overall_sentiment,
        analytics.conversation_intensity,
        trendingTopics,
        platformSources.length,
      );

      // ── Step 7: Save results ───────────────────────────────────────────────
      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({
          status: 'completed',
          processing_started_at: null,
          summary: aiResponse.summary,
          metrics: cloneJsonForPostgres(metrics),
          emotions: cloneJsonForPostgres(aiResponse.emotions),
          content_breakdown: cloneJsonForPostgres(aiResponse.content_breakdown),
          trending_topics: cloneJsonForPostgres(aiResponse.trending_topics),
          serp_data: cloneJsonForPostgres(serpData),
          raw_ai_response: cloneJsonForPostgres(aiResponse),
          tokens_used: aiResult.usage.totalTokens,
          estimated_cost: aiResult.estimatedCost,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error updating search with results:', updateError);
        await adminClient
          .from('topic_searches')
          .update({
            status: 'failed',
            processing_started_at: null,
            summary: `Could not save results: ${updateError.message}`,
          })
          .eq('id', id);
        await notifyTopicSearchFailedOnce(adminClient, id);
        return NextResponse.json(
          {
            error: 'Failed to save search results',
            details: updateError.message,
          },
          { status: 500 }
        );
      }

      // Sync to vault (non-blocking)
      syncSearchToVault(
        {
          ...search,
          status: 'completed',
          summary: aiResponse.summary,
          metrics,
          emotions: aiResponse.emotions,
          content_breakdown: aiResponse.content_breakdown,
          trending_topics: aiResponse.trending_topics,
          raw_ai_response: aiResponse,
          serp_data: serpData,
          tokens_used: aiResult.usage.totalTokens,
          estimated_cost: aiResult.estimatedCost,
          completed_at: new Date().toISOString(),
        },
        clientContext?.name,
      ).catch(() => {});

      // Notify user
      createNotification({
        recipientUserId: user.id,
        type: 'search_completed',
        title: 'Search completed',
        body: `Results ready for "${search.query}"`,
        linkPath: `/admin/search/${id}`,
      }).catch(() => {});

      return NextResponse.json({ status: 'completed' });
    } catch (aiError) {
      console.error('Processing error:', aiError);

      await adminClient
        .from('topic_searches')
        .update({
          status: 'failed',
          processing_started_at: null,
          summary: aiError instanceof Error
            ? `Search failed: ${aiError.message}`
            : 'Search failed due to an unknown error',
        })
        .eq('id', id);

      await notifyTopicSearchFailedOnce(adminClient, id);

      return NextResponse.json(
        {
          error: 'Search failed',
          details: aiError instanceof Error ? aiError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('POST /api/search/[id]/process error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function computeResonance(frequency: number, engagement: number): 'low' | 'medium' | 'high' | 'viral' {
  const score = frequency * 2 + Math.log10(Math.max(engagement, 1));
  if (score > 20) return 'viral';
  if (score > 12) return 'high';
  if (score > 6) return 'medium';
  return 'low';
}
