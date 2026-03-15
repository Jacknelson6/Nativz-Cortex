import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { IdeasResultsClient } from './results-client';

export default async function IdeaGenerationResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();

  const { data: generation, error } = await admin
    .from('idea_generations')
    .select('*, clients(id, name, agency)')
    .eq('id', id)
    .single();

  if (error || !generation) notFound();

  const client = Array.isArray(generation.clients) ? generation.clients[0] : generation.clients;

  // Fetch search data if linked
  let searchQuery: string | null = null;
  if (generation.search_id) {
    const { data: search } = await admin
      .from('topic_searches')
      .select('query')
      .eq('id', generation.search_id)
      .single();
    searchQuery = search?.query ?? null;
  }

  // Fetch saved scripts for this generation's ideas
  const ideaTitles = ((generation.ideas ?? []) as { title: string }[]).map((i) => i.title);
  const scriptMap: Record<string, string> = {};
  if (ideaTitles.length > 0 && generation.client_id) {
    const { data: scripts } = await admin
      .from('idea_scripts')
      .select('title, script_text')
      .eq('client_id', generation.client_id)
      .in('title', ideaTitles);
    for (const s of scripts ?? []) {
      if (s.title && s.script_text) scriptMap[s.title] = s.script_text;
    }
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <IdeasResultsClient
          generation={generation}
          clientName={(client as { name: string })?.name ?? 'Unknown'}
          agency={(client as { agency?: string })?.agency ?? null}
          searchQuery={searchQuery}
          savedScripts={scriptMap}
        />
      </div>
    </div>
  );
}
