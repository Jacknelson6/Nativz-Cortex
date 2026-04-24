/**
 * Inserts or updates a completed topic search demo for "Home furniture" with full report fields.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-home-furniture-topic-search.ts
 *
 * Optional env:
 *   TOPIC_SEARCH_ID=<uuid> — update this row instead of insert / query match
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { loadEnvLocal } from './load-env-local';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEMO_QUERY,
  DEMO_SUMMARY,
  activity_data,
  buildRawAiResponse,
  content_breakdown,
  emotions,
  metrics,
  pipeline_state,
  platform_data,
  research_sources,
  serp_data,
  trendingTopics,
} from './data/home-furniture-demo-topic-search';

loadEnvLocal();

async function main() {
  const admin = createAdminClient();
  const explicitId = process.env.TOPIC_SEARCH_ID?.trim();

  let targetId: string | null = explicitId || null;

  if (!targetId) {
    const { data: existing } = await admin
      .from('topic_searches')
      .select('id')
      .ilike('query', DEMO_QUERY)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    targetId = existing?.id ?? null;
  }

  const now = new Date().toISOString();
  const raw_ai_response = buildRawAiResponse();

  const payload = {
    query: DEMO_QUERY,
    source: 'all',
    time_range: 'last_3_months',
    language: 'en',
    country: 'us',
    status: 'completed' as const,
    processing_started_at: null,
    summary: DEMO_SUMMARY,
    metrics,
    emotions,
    content_breakdown,
    trending_topics: trendingTopics,
    serp_data,
    raw_ai_response,
    research_sources,
    pipeline_state,
    platform_data,
    activity_data,
    tokens_used: 15_420,
    estimated_cost: 0.38,
    completed_at: now,
    search_mode: 'client_strategy' as const,
    platforms: ['web', 'youtube', 'tiktok', 'reddit'],
    volume: 'medium' as const,
    search_version: 3,
    topic_pipeline: 'llm_v1',
    subtopics: ['Sectionals & layout', 'Dining & wood buys', 'Storage & bedroom', 'IKEA hacks & dupes'],
    client_id: null,
  };

  if (targetId) {
    const { error } = await admin.from('topic_searches').update(payload).eq('id', targetId);
    if (error) {
      console.error(error);
      process.exit(1);
    }
    console.log('Updated demo topic search:', targetId);
    console.log('Open:', `/finder/${targetId}`);
    return;
  }

  const { data: author } = await admin.from('users').select('id').limit(1).maybeSingle();
  if (!author?.id) {
    console.error('No row in public.users — add a user or link auth before seeding.');
    process.exit(1);
  }

  const { data: inserted, error: insErr } = await admin
    .from('topic_searches')
    .insert({
      ...payload,
      created_by: author.id,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    console.error(insErr);
    process.exit(1);
  }

  console.log('Inserted demo topic search:', inserted.id);
  console.log('Open:', `/finder/${inserted.id}`);
}

main();
