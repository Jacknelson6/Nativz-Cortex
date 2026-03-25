import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SubtopicsPlanClient } from '@/components/research/subtopics-plan-client';

export default async function AdminSearchSubtopicsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: search, error } = await supabase
    .from('topic_searches')
    .select('id, query, status, topic_pipeline')
    .eq('id', id)
    .single();

  if (error || !search) {
    notFound();
  }

  if ((search as { topic_pipeline?: string }).topic_pipeline !== 'llm_v1') {
    notFound();
  }

  if (search.status === 'completed') {
    redirect(`/admin/search/${id}`);
  }
  if (search.status === 'processing' || search.status === 'pending') {
    redirect(`/admin/search/${id}/processing`);
  }
  if (search.status !== 'pending_subtopics') {
    notFound();
  }

  return <SubtopicsPlanClient searchId={search.id} query={search.query} />;
}
