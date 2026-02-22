import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gatherSerpData } from '@/lib/brave/client';
import { createCompletion } from '@/lib/ai/client';
import { parseAIResponseJSON } from '@/lib/ai/parse';
import { buildOnboardStrategyPrompt } from '@/lib/prompts/onboard-strategy';
import { syncStrategyToVault } from '@/lib/vault/sync';
import type { ContentStrategy } from '@/lib/types/strategy';

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: userData } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userData || userData.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch client
    const { data: client, error: clientError } = await adminClient
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Create strategy record
    const { data: strategy, error: stratError } = await adminClient
      .from('client_strategies')
      .insert({
        client_id: clientId,
        status: 'processing',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (stratError || !strategy) {
      return NextResponse.json({ error: 'Failed to create strategy record' }, { status: 500 });
    }

    try {
      // Gather SERP data — search for industry + keywords
      const searchQueries = [
        `${client.industry} content strategy trends`,
        ...(client.topic_keywords ?? []).slice(0, 2).map(
          (kw: string) => `${kw} ${client.industry} social media`
        ),
      ];

      // Run searches in parallel
      const serpResults = await Promise.allSettled(
        searchQueries.map((q) => gatherSerpData(q, { timeRange: 'last_30_days' }))
      );

      // Merge SERP data
      const mergedSerp: import('@/lib/brave/types').BraveSerpData = {
        webResults: [],
        discussions: [],
        videos: [],
      };

      for (const r of serpResults) {
        if (r.status === 'fulfilled') {
          mergedSerp.webResults.push(...r.value.webResults);
          mergedSerp.discussions.push(...r.value.discussions);
          mergedSerp.videos.push(...r.value.videos);
        }
      }

      // Build and run the AI prompt
      const prompt = buildOnboardStrategyPrompt({
        clientName: client.name,
        industry: client.industry,
        targetAudience: client.target_audience ?? 'General',
        brandVoice: client.brand_voice ?? 'Professional and approachable',
        topicKeywords: client.topic_keywords ?? [],
        websiteUrl: client.website_url ?? '',
        serpData: mergedSerp,
        brandPreferences: client.preferences,
      });

      const aiResult = await createCompletion({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 16000,
      });

      const parsed = parseAIResponseJSON<ContentStrategy>(aiResult.text);

      // Save to DB
      await adminClient
        .from('client_strategies')
        .update({
          status: 'completed',
          executive_summary: parsed.executive_summary,
          audience_analysis: parsed.audience_analysis as unknown as Record<string, unknown>,
          content_pillars: parsed.content_pillars as unknown as Record<string, unknown>[],
          platform_strategy: parsed.platform_strategy as unknown as Record<string, unknown>[],
          trending_opportunities: parsed.trending_opportunities as unknown as Record<string, unknown>[],
          video_ideas: parsed.video_ideas as unknown as Record<string, unknown>[],
          competitive_landscape: parsed.competitive_landscape as unknown as Record<string, unknown>[],
          next_steps: parsed.next_steps as unknown as Record<string, unknown>[],
          raw_ai_response: parsed as unknown as Record<string, unknown>,
          serp_data: mergedSerp as unknown as Record<string, unknown>,
          tokens_used: aiResult.usage.totalTokens,
          estimated_cost: aiResult.estimatedCost,
          completed_at: new Date().toISOString(),
        })
        .eq('id', strategy.id);

      // Non-blocking vault sync
      syncStrategyToVault(parsed, client.name, client.industry).catch(() => {});

      return NextResponse.json({
        strategyId: strategy.id,
        status: 'completed',
        tokens_used: aiResult.usage.totalTokens,
        estimated_cost: aiResult.estimatedCost,
      });
    } catch (processError) {
      // Mark strategy as failed
      await adminClient
        .from('client_strategies')
        .update({ status: 'failed' })
        .eq('id', strategy.id);

      console.error('Strategy generation failed:', processError);
      return NextResponse.json(
        { error: 'Strategy generation failed', details: processError instanceof Error ? processError.message : 'Unknown error' },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('POST /api/clients/[id]/strategy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: clientId } = await params;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Verify the requesting user has access (admin or same organization)
    const { data: userData } = await adminClient
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single();

    if (userData?.role === 'viewer') {
      // Portal user: verify they belong to the same organization as this client
      const { data: clientOrg } = await adminClient
        .from('clients')
        .select('organization_id')
        .eq('id', clientId)
        .single();

      if (!clientOrg || clientOrg.organization_id !== userData.organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Get most recent strategy for this client
    const { data: strategy, error } = await adminClient
      .from('client_strategies')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !strategy) {
      return NextResponse.json({ error: 'No strategy found for this client' }, { status: 404 });
    }

    return NextResponse.json(strategy);
  } catch (error) {
    console.error('GET /api/clients/[id]/strategy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
