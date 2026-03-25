import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SearchProcessing } from '@/components/search/search-processing';

export default async function AdminSearchProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: search, error } = await supabase
    .from('topic_searches')
    .select('id, query, status, volume, platforms')
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

  return (
    <SearchProcessing
      searchId={id}
      query={search.query}
      redirectPrefix="/admin"
      volume={(search.volume as string) ?? 'medium'}
      platforms={(search.platforms as string[]) ?? ['web']}
    />
  );
}
