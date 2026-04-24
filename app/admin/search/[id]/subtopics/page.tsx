import { unstable_noStore as noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SubtopicsPlanClient } from '@/components/research/subtopics-plan-client';
import { getTimeRangeOptionLabel } from '@/lib/types/search';

export const dynamic = 'force-dynamic';

export default async function AdminSearchSubtopicsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: search, error } = await supabase
    .from('topic_searches')
    .select('id, query, status, topic_pipeline, time_range, source')
    .eq('id', id)
    .single();

  if (error || !search) {
    notFound();
  }

  if ((search as { topic_pipeline?: string }).topic_pipeline !== 'llm_v1') {
    notFound();
  }

  if (search.status === 'completed') {
    redirect(`/admin/finder/${id}`);
  }
  if (search.status === 'processing' || search.status === 'pending') {
    redirect(`/admin/finder/${id}/processing`);
  }
  if (search.status !== 'pending_subtopics') {
    notFound();
  }

  const timeRangeLabel = getTimeRangeOptionLabel(
    (search as { time_range?: string | null }).time_range ?? 'last_3_months',
  );

  return (
    <SubtopicsPlanClient
      searchId={search.id}
      query={search.query}
      timeRangeLabel={timeRangeLabel}
      initialTimeRange={(search as { time_range?: string | null }).time_range ?? 'last_3_months'}
      initialSource={(search as any).source ?? 'all'}
    />
  );
}
