import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { PageError } from '@/components/shared/page-error';
import { ContentLabGeneralChat } from '@/components/content-lab/content-lab-general-chat';
import { ContentLabWorkspace } from '@/components/content-lab/content-lab-workspace';
import { loadPillarReferencePreviews } from '@/lib/content-lab/pillar-reference-previews';
import { getKnowledgeEntries, getKnowledgeGraph } from '@/lib/knowledge/queries';
import { getActiveAdminClient } from '@/lib/admin/get-active-client';

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean | null;
  logo_url: string | null;
  agency: string | null;
};

type AdminClient = ReturnType<typeof createAdminClient>;

type AttachedScopeType = 'audit' | 'tiktok_shop_search' | 'topic_search';

interface InitialScope {
  type: AttachedScopeType;
  id: string;
  label: string;
}

/**
 * Resolve `?attach={type}:{id}` into an InitialScope (server-side so the
 * chat component gets a human-readable label to render without a fetch
 * round-trip). Drops silently when the payload is malformed or the row
 * doesn't exist — the URL is a deep-link convenience, not a requirement.
 */
async function resolveAttach(
  adminClient: AdminClient,
  raw: string | undefined,
): Promise<InitialScope | null> {
  if (!raw) return null;
  const [type, id] = raw.split(':');
  if (!id || !['audit', 'tiktok_shop_search', 'topic_search'].includes(type)) return null;

  try {
    if (type === 'tiktok_shop_search') {
      const { data } = await adminClient.from('tiktok_shop_searches').select('query').eq('id', id).maybeSingle();
      if (!data) return null;
      return { type: 'tiktok_shop_search', id, label: data.query || 'TikTok Shop search' };
    }
    if (type === 'topic_search') {
      const { data } = await adminClient.from('topic_searches').select('query').eq('id', id).maybeSingle();
      if (!data) return null;
      return { type: 'topic_search', id, label: data.query || 'Topic search' };
    }
    if (type === 'audit') {
      const { data } = await adminClient
        .from('prospect_audits')
        .select('website_url, prospect_data')
        .eq('id', id)
        .maybeSingle();
      if (!data) return null;
      const pd = data.prospect_data as { websiteContext?: { title?: string | null } } | null;
      const label = pd?.websiteContext?.title?.trim() || data.website_url || 'Organic Social audit';
      return { type: 'audit', id, label };
    }
  } catch {
    /* Silent drop — URL attach is best-effort */
  }
  return null;
}

/**
 * `/admin/strategy-lab` — the single entry point for Strategy Lab after
 * NAT-57's URL flatten. No more `[clientId]` in the URL; the session brand
 * pill drives which client's workspace renders. Switching brands in the
 * pill re-runs this server component with a new cookie, so the workspace
 * reshapes in place without a route change (RankPrompt-style).
 *
 * When no brand is pinned, fall back to the cross-brand general chat —
 * same fallback we shipped in NAT-57 step 4.
 */
export default async function StrategyLabPage({
  searchParams,
}: {
  searchParams: Promise<{ attach?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/admin/login');
  }

  const { attach: attachParam } = await searchParams;
  const initialAttachedSearchId = (() => {
    if (!attachParam) return null;
    const [type, id] = attachParam.split(':');
    return type === 'topic_search' && id ? id : null;
  })();

  const admin = createAdminClient();
  const active = await getActiveAdminClient().catch(() => null);

  // ── Branded workspace (Our brand mode) ──────────────────────────────────
  if (active?.brand) {
    const clientId = active.brand.id;

    const { data: client } = await admin
      .from('clients')
      .select('id, name, slug, brand_dna_status')
      .eq('id', clientId)
      .maybeSingle();

    if (!client) {
      // Brand pill is pointing at a client we can't load — bail to the
      // general chat so the user isn't stranded on an error page.
      return renderGeneralChat(admin, attachParam);
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

  // ── No brand pinned → general cross-brand chat fallback ────────────────
  return renderGeneralChat(admin, attachParam);
}

async function renderGeneralChat(adminClient: AdminClient, attachParam: string | undefined) {
  try {
    const { data: dbClients, error: dbError } = await selectClientsWithRosterVisibility<ClientRow>(adminClient, {
      select: 'id, name, slug, is_active, logo_url, agency',
      orderBy: { column: 'name' },
    });
    if (dbError) throw dbError;

    const clients = (dbClients ?? [])
      .filter((c) => c.is_active !== false)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo_url: c.logo_url,
        agency: c.agency,
      }));

    const initialScope = await resolveAttach(adminClient, attachParam);

    return (
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col p-4 md:p-6">
        <ContentLabGeneralChat clients={clients} initialScope={initialScope} />
      </div>
    );
  } catch (err) {
    console.error('Strategy lab general chat:', err);
    return <PageError title="Could not load clients" />;
  }
}
