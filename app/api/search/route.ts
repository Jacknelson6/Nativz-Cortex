import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTopicResearchPrompt } from '@/lib/prompts/topic-research';
import { gatherSerpData } from '@/lib/brave/client';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import type { TopicSearchAIResponse } from '@/lib/types/search';

const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  source: z.string().default('all'),
  time_range: z.string().default('last_3_months'),
  language: z.string().default('all'),
  country: z.string().default('us'),
  client_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = searchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { query, source, time_range, language, country, client_id } = parsed.data;

    // Use admin client for DB operations (bypasses RLS)
    const adminClient = createAdminClient();

    // Fetch optional client context
    let clientContext = null;
    if (client_id) {
      const { data: client } = await adminClient
        .from('clients')
        .select('name, industry, target_audience, brand_voice')
        .eq('id', client_id)
        .single();

      if (client) {
        clientContext = {
          name: client.name,
          industry: client.industry,
          targetAudience: client.target_audience,
          brandVoice: client.brand_voice,
        };
      }
    }

    // Insert pending row
    const { data: search, error: insertError } = await adminClient
      .from('topic_searches')
      .insert({
        query,
        source,
        time_range,
        language,
        country,
        client_id: client_id || null,
        status: 'processing',
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError || !search) {
      console.error('Error creating search record:', insertError);
      return NextResponse.json(
        { error: 'Failed to create search', details: insertError?.message || 'No data returned' },
        { status: 500 }
      );
    }

    try {
      // Step 1: Gather SERP data from Brave Search API
      const serpData = await gatherSerpData(query, {
        timeRange: time_range,
        country,
        language,
        source,
      });

      // Step 2: Build prompt with Brave results as context
      const prompt = buildTopicResearchPrompt({
        query,
        source,
        timeRange: time_range,
        language,
        country,
        serpData,
        clientContext,
      });

      // Step 3: Call Claude via OpenRouter (no webSearch — Brave replaces it)
      const aiResult = await createCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 16000,
      });

      const aiResponse = parseAIResponseJSON<TopicSearchAIResponse>(aiResult.text);

      // Step 4: Update with results
      const { error: updateError } = await adminClient
        .from('topic_searches')
        .update({
          status: 'completed',
          summary: aiResponse.summary,
          metrics: aiResponse.metrics,
          activity_data: aiResponse.activity_data,
          emotions: aiResponse.emotions,
          content_breakdown: aiResponse.content_breakdown,
          trending_topics: aiResponse.trending_topics,
          raw_ai_response: aiResponse,
          tokens_used: aiResult.usage.totalTokens,
          estimated_cost: aiResult.estimatedCost,
          completed_at: new Date().toISOString(),
        })
        .eq('id', search.id);

      if (updateError) {
        console.error('Error updating search with results:', updateError);
      }

      return NextResponse.json({ id: search.id, status: 'completed' });
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
        .eq('id', search.id);

      return NextResponse.json(
        {
          error: 'Search failed',
          id: search.id,
          details: aiError instanceof Error ? aiError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('POST /api/search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
