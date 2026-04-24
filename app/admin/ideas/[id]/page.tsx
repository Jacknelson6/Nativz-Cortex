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

  const ideaTitles = ((generation.ideas ?? []) as { title: string }[]).map((i) => i.title);

  // topic_searches + idea_scripts both depend on `generation` but are
  // independent of each other — parallel saves one DB round-trip.
  const [searchRes, scriptsRes] = await Promise.all([
    generation.search_id
      ? admin
          .from('topic_searches')
          .select('query')
          .eq('id', generation.search_id)
          .single()
      : Promise.resolve({ data: null as { query: string | null } | null }),
    ideaTitles.length > 0 && generation.client_id
      ? admin
          .from('idea_scripts')
          .select('title, script_text')
          .eq('client_id', generation.client_id)
          .in('title', ideaTitles)
      : Promise.resolve({ data: [] as { title: string | null; script_text: string | null }[] }),
  ]);
  const searchQuery = searchRes.data?.query ?? null;
  const scriptMap: Record<string, string> = {};
  for (const s of scriptsRes.data ?? []) {
    if (s.title && s.script_text) scriptMap[s.title] = s.script_text;
  }

  return (
    <div className="cortex-page-gutter">
      <div className="max-w-5xl mx-auto">
        <IdeasResultsClient
          generation={generation}
          clientName={(client as { name: string })?.name ?? 'Unknown'}
          agency={(client as { agency?: string })?.agency ?? null}
          searchQuery={searchQuery}
          searchId={generation.search_id}
          savedScripts={scriptMap}
        />
      </div>
    </div>
  );
}
