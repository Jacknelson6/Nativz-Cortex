import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTopicResearchPrompt } from '@/lib/prompts/topic-research';
import { buildClientStrategyPrompt } from '@/lib/prompts/client-strategy';
import { gatherSerpData } from '@/lib/serp/client';
import { gatherPlatformData, formatPlatformContext } from '@/lib/search/platform-router';
import type { SearchPlatform } from '@/lib/types/search';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { computeMetricsFromSerp } from '@/lib/utils/compute-metrics';
import type { TopicSearchAIResponse } from '@/lib/types/search';
import type { SerpData } from '@/lib/serp/types';
import { createNotification } from '@/lib/notifications/create';
import { crawlWebsite } from '@/lib/cloudflare/crawl';
import { getClientMemory, formatClientMemoryBlock } from '@/lib/vault/content-memory';
import type { ClientPreferences } from '@/lib/types/database';

export const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  source: z.string().default('all'),
  time_range: z.string().default('last_3_months'),
  language: z.string().default('all'),
  country: z.string().default('us'),
  client_id: z.string().uuid().nullable().optional(),
  search_mode: z.enum(['general', 'client_strategy']).default('general'),
  platforms: z.array(z.enum(['web', 'reddit', 'youtube', 'tiktok'])).default(['web']),
  volume: z.enum(['quick', 'deep']).default('quick'),
});

export type TopicSearchExecuteInput = z.infer<typeof searchSchema>;

export type TopicSearchActor = {
  id: string;
  email?: string | null;
  role: 'admin' | 'viewer';
  organizationId?: string | null;
};

export type ExecuteTopicSearchResult =
  | { ok: true; searchId: string }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'insert'; message: string }
  | { ok: false; reason: 'pipeline'; searchId: string; message: string };

function buildSerpUrlSet(serpData: SerpData): Set<string> {
  const urls = new Set<string>();
  for (const r of serpData.webResults) urls.add(r.url);
  for (const d of serpData.discussions) urls.add(d.url);
  for (const v of serpData.videos) urls.add(v.url);
  return urls;
}

function validateTopicSources(
  aiResponse: TopicSearchAIResponse,
  serpUrls: Set<string>,
): TopicSearchAIResponse {
  return {
    ...aiResponse,
    trending_topics: (aiResponse.trending_topics ?? []).map((topic) => ({
      ...topic,
      sources: (topic.sources ?? []).filter((source) => serpUrls.has(source.url)),
      video_ideas: topic.video_ideas ?? [],
    })),
  };
}

/**
 * Core topic search pipeline (SERP → prompt → AI → metrics → DB).
 * Used by POST /api/search and one-off setup scripts.
 */
export async function executeTopicSearch(
  adminClient: SupabaseClient,
  actor: TopicSearchActor,
  input: TopicSearchExecuteInput,
  options?: { skipNotification?: boolean },
): Promise<ExecuteTopicSearchResult> {
  const {
    query,
    source,
    time_range,
    language,
    country,
    client_id,
    search_mode,
    platforms,
    volume,
  } = input;
  const isV2 = platforms.length > 1 || platforms.includes('reddit');

  let clientContext: {
    name: string;
    industry: string;
    targetAudience?: string | null;
    brandVoice?: string | null;
    topicKeywords?: string[] | null;
    websiteUrl?: string | null;
  } | null = null;
  let brandPreferences: ClientPreferences | null = null;
  let websiteContent: { url: string; content: string }[] | null = null;
  let clientMemoryBlock: string | null = null;

  if (client_id) {
    const { data: client } = await adminClient
      .from('clients')
      .select('name, industry, target_audience, brand_voice, topic_keywords, website_url, preferences, organization_id')
      .eq('id', client_id)
      .single();

    if (client) {
      if (actor.role === 'viewer' && client.organization_id !== actor.organizationId) {
        return { ok: false, reason: 'forbidden' };
      }

      clientContext = {
        name: client.name,
        industry: client.industry,
        targetAudience: client.target_audience,
        brandVoice: client.brand_voice,
        topicKeywords: client.topic_keywords,
        websiteUrl: client.website_url,
      };
      brandPreferences = (client.preferences as ClientPreferences) ?? null;

      const memory = await getClientMemory(client_id);
      const memBlock = formatClientMemoryBlock(memory);
      if (!memBlock.includes('No previous content history')) {
        clientMemoryBlock = memBlock;
      }

      if (search_mode === 'client_strategy' && client.website_url) {
        websiteContent = await crawlWebsite(client.website_url);
      }
    }
  }

  const { data: search, error: insertError } = await adminClient
    .from('topic_searches')
    .insert({
      query,
      source,
      time_range,
      language,
      country,
      client_id: client_id || null,
      search_mode,
      status: 'processing',
      created_by: actor.id,
      platforms,
      search_version: isV2 ? 2 : 1,
      volume,
    })
    .select()
    .single();

  if (insertError || !search) {
    console.error('Error creating search record:', insertError);
    return { ok: false, reason: 'insert', message: insertError?.message ?? 'No data returned' };
  }

  try {
    let serpData: SerpData;
    let platformContext = '';

    if (isV2) {
      const platformResults = await gatherPlatformData(
        query,
        platforms as SearchPlatform[],
        time_range,
        volume as 'quick' | 'deep',
      );
      serpData = platformResults.serpData ?? { webResults: [], discussions: [], videos: [] };
      platformContext = formatPlatformContext(platformResults.sources, platformResults.platformStats);

      await adminClient
        .from('topic_searches')
        .update({
          platform_data: {
            stats: platformResults.platformStats,
            sourceCount: platformResults.sources.length,
          },
        })
        .eq('id', search.id);
    } else {
      serpData = await gatherSerpData(query, {
        timeRange: time_range,
        country,
        language,
        source,
      });
    }

    let prompt: string;
    if (search_mode === 'client_strategy' && clientContext) {
      prompt = buildClientStrategyPrompt({
        query,
        source,
        timeRange: time_range,
        language,
        country,
        serpData,
        clientContext,
        brandPreferences,
        websiteContent,
        clientMemoryBlock,
      });
    } else {
      prompt = buildTopicResearchPrompt({
        query,
        source,
        timeRange: time_range,
        language,
        country,
        serpData,
        clientContext,
        brandPreferences,
        websiteContent,
        clientMemoryBlock,
      });
    }

    if (isV2 && platformContext) {
      prompt = prompt.replace(
        '</research_data>',
        `\n\n<platform_data>\n${platformContext}\n</platform_data>\n</research_data>`,
      );
    }

    const aiResult = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 16000,
      feature: 'topic_search',
      userId: actor.id,
      userEmail: actor.email ?? undefined,
    });

    const rawAiResponse = parseAIResponseJSON<TopicSearchAIResponse>(aiResult.text);
    const serpUrls = buildSerpUrlSet(serpData);
    const aiResponse = validateTopicSources(rawAiResponse, serpUrls);

    const metrics = computeMetricsFromSerp(
      serpData,
      aiResponse.overall_sentiment,
      aiResponse.conversation_intensity,
      aiResponse.trending_topics,
    );

    const { error: updateError } = await adminClient
      .from('topic_searches')
      .update({
        status: 'completed',
        summary: aiResponse.summary,
        metrics,
        emotions: aiResponse.emotions,
        content_breakdown: aiResponse.content_breakdown,
        trending_topics: aiResponse.trending_topics,
        serp_data: serpData,
        raw_ai_response: aiResponse,
        tokens_used: aiResult.usage.totalTokens,
        estimated_cost: aiResult.estimatedCost,
        completed_at: new Date().toISOString(),
      })
      .eq('id', search.id);

    if (updateError) {
      console.error('Error updating search with results:', updateError);
    }

    if (!options?.skipNotification) {
      createNotification({
        recipientUserId: actor.id,
        type: 'search_completed',
        title: 'Search completed',
        body: `Results ready for "${query}"`,
        linkPath: `/admin/search/${search.id}`,
      }).catch(() => {});
    }

    return { ok: true, searchId: search.id };
  } catch (aiError) {
    console.error('AI processing error:', aiError);
    const message =
      aiError instanceof Error ? aiError.message : 'Search failed due to an unknown error';

    await adminClient
      .from('topic_searches')
      .update({
        status: 'failed',
        summary: aiError instanceof Error ? `Search failed: ${aiError.message}` : 'Search failed due to an unknown error',
      })
      .eq('id', search.id);

    return { ok: false, reason: 'pipeline', searchId: search.id, message };
  }
}
