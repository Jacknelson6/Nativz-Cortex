import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ContentLabWorkspace } from '@/components/content-lab/content-lab-workspace';
import { loadPillarReferencePreviews } from '@/lib/content-lab/pillar-reference-previews';
import { getKnowledgeEntries, getKnowledgeGraph } from '@/lib/knowledge/queries';

export default async function ContentLabClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ attach?: string }>;
}) {
  const { clientId } = await params;
  const { attach } = await searchParams;
  const initialAttachedSearchId = (() => {
    if (!attach) return null;
    const [type, id] = attach.split(':');
    return type === 'topic_search' && id ? id : null;
  })();

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/admin/login');
  }

  const admin = createAdminClient();

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name, slug, brand_dna_status')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr || !client) {
    notFound();
  }

  let brandGuideline: {
    id: string;
    content: string;
    metadata: unknown;
    created_at: string;
    updated_at: string;
  } | null = null;

  if (client.brand_dna_status !== 'none') {
    const { data: g } = await admin
      .from('client_knowledge_entries')
      .select('id, content, metadata, created_at, updated_at')
      .eq('client_id', client.id)
      .eq('type', 'brand_guideline')
      .is('metadata->superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    brandGuideline = g;
  }

  const [{ data: topicRows }, { data: pillarRows }, { data: boardRows }] = await Promise.all([
    admin
      .from('topic_searches')
      .select('id, query, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('content_pillars')
      .select('*')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: true }),
    admin
      .from('moodboard_boards')
      .select('id, name, archived_at, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(50),
  ]);

  const topicSearches = topicRows ?? [];
  const pillars = pillarRows ?? [];
  const boards = (boardRows ?? []).filter((b) => !b.archived_at);

  const boardIds = boards.map((b) => b.id as string);
  const boardThumbnails: Record<string, string[]> = {};
  const boardItemCounts: Record<string, number> = {};
  if (boardIds.length > 0) {
    const { data: itemData } = await admin
      .from('moodboard_items')
      .select('board_id, thumbnail_url')
      .in('board_id', boardIds);
    if (itemData) {
      for (const row of itemData) {
        const bid = row.board_id as string;
        boardItemCounts[bid] = (boardItemCounts[bid] ?? 0) + 1;
        const url = row.thumbnail_url as string | null;
        if (!url) continue;
        if (!boardThumbnails[bid]) boardThumbnails[bid] = [];
        if (boardThumbnails[bid].length < 4) boardThumbnails[bid].push(url);
      }
    }
  }

  const moodBoardsWithThumbs = boards.map((b) => ({
    id: b.id as string,
    name: (b.name as string) ?? 'Untitled',
    thumbnails: boardThumbnails[b.id as string] ?? [],
    itemCount: boardItemCounts[b.id as string] ?? 0,
  }));

  const { count: completedIdeaGenCount } = await admin
    .from('idea_generations')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'completed');

  const pillarIds = (pillars ?? []).map((p) => p.id as string);
  const pillarReferencePreviews = await loadPillarReferencePreviews(admin, client.id, pillarIds);

  const [vaultEntries, vaultGraphData] = await Promise.all([
    getKnowledgeEntries(client.id),
    getKnowledgeGraph(client.id),
  ]);

  return (
    <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
      <ContentLabWorkspace
        clientId={client.id}
        clientSlug={client.slug ?? ''}
        clientName={client.name ?? ''}
        brandDnaStatus={client.brand_dna_status ?? 'none'}
        brandGuideline={brandGuideline}
        topicSearches={topicSearches}
        pillars={pillars}
        pillarReferencePreviews={pillarReferencePreviews}
        moodBoards={moodBoardsWithThumbs}
        hasCompletedIdeaGeneration={(completedIdeaGenCount ?? 0) > 0}
        vaultEntries={vaultEntries}
        vaultGraphData={vaultGraphData}
        initialAttachedSearchId={initialAttachedSearchId}
      />
    </div>
  );
}
