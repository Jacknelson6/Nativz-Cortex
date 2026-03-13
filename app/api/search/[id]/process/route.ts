import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTopicResearchPrompt } from '@/lib/prompts/topic-research';
import { buildClientStrategyPrompt } from '@/lib/prompts/client-strategy';
import { gatherSerpData } from '@/lib/brave/client';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { computeMetricsFromSerp } from '@/lib/utils/compute-metrics';
import type { TopicSearchAIResponse } from '@/lib/types/search';
import type { BraveSerpData } from '@/lib/brave/types';
import type { ClientPreferences } from '@/lib/types/database';
import { syncSearchToVault } from '@/lib/vault/sync';
import { createNotification } from '@/lib/notifications/create';

export const maxDuration = 300;

/**
 * Build a set of all URLs present in the SERP data for validation.
 */
function buildSerpUrlSet(serpData: BraveSerpData): Set<string> {
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

    // Fetch the search record
    const { data: search, error: fetchError } = await adminClient
      .from('topic_searches')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !search) {
      return NextResponse.json({ error: 'Search not found' }, { status: 404 });
    }

    if (search.status === 'completed') {
      return NextResponse.json({ status: 'completed' });
    }

    if (search.status !== 'processing') {
      return NextResponse.json({ error: 'Search is not in processing state' }, { status: 400 });
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

    try {
      // Step 1: Gather SERP data from Brave Search API
      const serpData = await gatherSerpData(search.query, {
        timeRange: search.time_range,
        country: search.country,
        language: search.language,
        source: search.source,
      });

      // Step 1b: Fetch knowledge base context for client searches
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

          // Extract structured entities
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

          // Recent meeting insights
          const meetings = entries.filter((e) => e.type === 'meeting_note').slice(0, 3);
          if (meetings.length > 0) {
            parts.push(`### Recent Meeting Insights\n${meetings.map((m) => `- ${m.title}: ${m.content.substring(0, 200)}...`).join('\n')}`);
          }

          if (parts.length > 0) {
            clientKnowledgeBlock = parts.join('\n\n');
          }
        } catch {
          // Non-blocking — knowledge enrichment is optional
        }
      }

      // Step 2: Build prompt with Brave results as context
      let prompt: string;
      if (search.search_mode === 'client_strategy' && clientContext) {
        prompt = buildClientStrategyPrompt({
          query: search.query,
          source: search.source,
          timeRange: search.time_range,
          language: search.language,
          country: search.country,
          serpData,
          clientContext,
          brandPreferences,
          clientKnowledgeBlock,
        });
      } else {
        prompt = buildTopicResearchPrompt({
          query: search.query,
          source: search.source,
          timeRange: search.time_range,
          language: search.language,
          country: search.country,
          serpData,
          clientContext,
          brandPreferences,
          clientKnowledgeBlock,
        });
      }

      // Step 3: Call Claude via OpenRouter
      const aiResult = await createCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 16000,
      });

      const rawAiResponse = parseAIResponseJSON<TopicSearchAIResponse>(aiResult.text);

      // Step 4: Validate AI-cited URLs against actual SERP data
      const serpUrls = buildSerpUrlSet(serpData);
      const aiResponse = validateTopicSources(rawAiResponse, serpUrls);

      // Step 5: Compute real metrics from SERP data + AI sentiment + topics
      const metrics = computeMetricsFromSerp(
        serpData,
        aiResponse.overall_sentiment ?? 0,
        aiResponse.conversation_intensity ?? 'moderate',
        aiResponse.trending_topics ?? []
      );

      // Step 6: Update with results
      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({
          status: 'completed',
          summary: aiResponse.summary ?? '',
          metrics,
          emotions: aiResponse.emotions ?? [],
          content_breakdown: aiResponse.content_breakdown ?? null,
          trending_topics: aiResponse.trending_topics ?? [],
          serp_data: serpData,
          raw_ai_response: aiResponse,
          tokens_used: aiResult.usage.totalTokens,
          estimated_cost: aiResult.estimatedCost,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        console.error('Error updating search with results:', updateError);
      }

      // Sync to Obsidian vault (non-blocking)
      syncSearchToVault(
        {
          ...search,
          status: 'completed',
          summary: aiResponse.summary ?? '',
          metrics,
          emotions: aiResponse.emotions ?? [],
          content_breakdown: aiResponse.content_breakdown ?? null,
          trending_topics: aiResponse.trending_topics ?? [],
          raw_ai_response: aiResponse,
          serp_data: serpData,
          tokens_used: aiResult.usage.totalTokens,
          estimated_cost: aiResult.estimatedCost,
          completed_at: new Date().toISOString(),
        },
        clientContext?.name,
      ).catch(() => {}); // Never fail the response

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
      console.error('AI processing error:', aiError);

      await adminClient
        .from('topic_searches')
        .update({
          status: 'failed',
          summary: aiError instanceof Error
            ? `Search failed: ${aiError.message}`
            : 'Search failed due to an unknown error',
        })
        .eq('id', id);

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
