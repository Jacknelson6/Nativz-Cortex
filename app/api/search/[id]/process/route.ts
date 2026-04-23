import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TopicSearch } from '@/lib/types/search';
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
 * POST /api/search/[id]/process
 *
 * Research pipeline:
 * 1. Plan subtopics from the user query
 * 2. Research each subtopic in parallel (SearXNG SERP + LLM synthesis)
 * 3. Merge subtopic reports into final output (topics, emotions, breakdowns)
 * 4. Normalize + validate with Zod
 * 5. Save results
 *
 * @auth Required — checks user access to the search
 * @body None (search ID from URL)
 * @returns { status: 'completed' | 'processing' } or error
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

    // Fetch optional client context
    let clientContext = null;
    if (search.client_id) {
      const { data: client } = await adminClient
        .from('clients')
        .select('name, industry, target_audience, brand_voice, topic_keywords, website_url')
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
      }
    }

    // Read platforms from the search record. Per-platform volumes now come
    // from scraper_settings (admin UI), not from the search record — the
    // legacy `volume` column is left unused for backward compat.
    const platforms: string[] = search.platforms ?? ['web'];

    // Per-search budget guard — projects total Apify spend from current
    // scraper_settings and rejects the search if it would exceed
    // SEARCH_BUDGET_USD (default $2). Stops the kind of runaway spend
    // that caused the 2026-04-23 $37 Apify bill incident.
    try {
      const { getScraperSettings } = await import('@/lib/search/scraper-settings');
      const { checkSearchBudget } = await import('@/lib/search/budget-guard');
      const settings = await getScraperSettings();
      const budget = checkSearchBudget(settings);
      if (!budget.ok) {
        console.warn('[search:process] budget guard tripped:', budget.reason);
        await adminClient
          .from('topic_searches')
          .update({
            status: 'failed',
            error_message: budget.reason ?? 'Projected cost exceeds per-search budget',
          })
          .eq('id', id);
        return NextResponse.json(
          {
            error: budget.reason ?? 'Over budget',
            projected_usd: budget.projectedUsd,
            drop_suggestions: budget.dropSuggestions,
          },
          { status: 402 }, // Payment Required is the honest status here
        );
      }
    } catch (err) {
      // Budget guard is belt-and-braces — a failure here shouldn't block a
      // search from running. Log and proceed.
      console.warn('[search:process] budget guard errored (ignoring):', err);
    }

    try {
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
          });
          lastError = null;
          break;
        } catch (retryErr) {
          lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
          console.error(`[process] Research pipeline attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);
          if (attempt < MAX_RETRIES) {
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
      const nonTikTokSources = allPlatformSources.filter((s) => s.platform !== 'tiktok');

      // Batch 1: all non-TikTok sources (Reddit/YouTube — no transcripts
      // so they're small) + top 8 TikTok videos + essentials. Previously this
      // filtered to TikTok-only, which meant the 3m+ we just spent scraping
      // Reddit/YouTube was silently discarded — those platforms were
      // collected into allPlatformSources but never persisted.
      // Batch 2: next 42 TikTok videos (50 TikTok cap — keeps payload under
      // PostgREST limits because TikTok rows carry transcripts + comments).
      const batch1Sources = [...nonTikTokSources.map(mapSource), ...tiktokSources.slice(0, 8).map(mapSource)];
      const batch2Sources = tiktokSources.slice(8, 50).map(mapSource);

      // Save in two batches to avoid PostgREST payload size limits.
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
        console.error('[process] batch1 save failed:', batch1Err);
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

      // Batch 2: remaining platform sources, serp data, research sources, pipeline state
      if (batch2Sources.length > 0 || result.serpData || result.researchSources) {
        await adminClient
          .from('topic_searches')
          .update({
            serp_data: cloneJsonForPostgres(
              safeJson(result.serpData, { webResults: [], discussions: [], videos: [] }),
            ),
            research_sources: cloneJsonForPostgres(safeJson(result.researchSources, [])),
            pipeline_state: cloneJsonForPostgres(safeJson(result.pipelineState, {})),
            platform_data: cloneJsonForPostgres({
              stats: [],
              sourceCount: allPlatformSources.length,
              sources: [...batch1Sources, ...batch2Sources],
            }),
          })
          .eq('id', id)
          .then(({ error: batch2Err }) => {
            if (batch2Err) {
              console.error('[process] batch2 save failed (non-critical):', batch2Err.message);
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
        title: 'Research completed',
        body: `Results ready for "${search.query}"`,
        linkPath: `/admin/search/${id}`,
      }).catch(() => {});

      return NextResponse.json({ status: 'completed' });
    } catch (aiError) {
      console.error('POST /api/search/[id]/process error:', aiError);

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
