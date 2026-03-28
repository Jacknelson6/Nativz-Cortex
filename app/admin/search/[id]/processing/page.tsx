import { unstable_noStore as noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SearchProcessing } from '@/components/search/search-processing';
import { getTopicSearchWebResearchMode } from '@/lib/config/topic-search-web-research';

/** Avoid cached RSC reading stale `pending_subtopics` and bouncing users back to the gameplan. */
export const dynamic = 'force-dynamic';

export default async function AdminSearchProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: search, error } = await supabase
    .from('topic_searches')
    .select('id, query, status, volume, platforms, topic_pipeline, subtopics')
    .eq('id', id)
    .single();

  if (error || !search) {
    notFound();
  }

  // If already completed, skip straight to results
  if (search.status === 'completed') {
    redirect(`/admin/search/${id}`);
  }

  if (search.status === 'pending_subtopics') {
    redirect(`/admin/search/${id}/subtopics`);
  }

  const topicPipeline = (search.topic_pipeline as 'legacy' | 'llm_v1' | undefined) ?? 'legacy';
  const rawSub = search.subtopics as unknown;
  const subtopicCount = Array.isArray(rawSub) ? rawSub.length : 3;

  return (
    <SearchProcessing
      searchId={id}
      query={search.query}
      redirectPrefix="/admin"
      volume={(search.volume as string) ?? 'medium'}
      platforms={(search.platforms as string[]) ?? ['web']}
      pipeline={topicPipeline}
      subtopicCount={subtopicCount}
      webResearchMode={getTopicSearchWebResearchMode()}
    />
  );
}
