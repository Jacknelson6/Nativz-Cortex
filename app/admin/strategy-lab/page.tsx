import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { selectClientsWithRosterVisibility } from '@/lib/clients/roster-visibility-query';
import { PageError } from '@/components/shared/page-error';
import { ContentLabGeneralChat } from '@/components/content-lab/content-lab-general-chat';
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

export default async function ContentLabIndexPage({
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

  // If the admin has a working brand pinned via the top-bar pill, send them
  // straight into that brand's Strategy Lab workspace instead of the
  // general cross-brand chat. Any `?attach=…` deep-link param rides along
  // — the brand-scoped workspace consumes it too.
  const { attach: attachParam } = await searchParams;
  const active = await getActiveAdminClient().catch(() => null);
  if (active?.brand) {
    const qs = attachParam ? `?attach=${encodeURIComponent(attachParam)}` : '';
    redirect(`/admin/strategy-lab/${active.brand.id}${qs}`);
  }

  try {
    const adminClient = createAdminClient();
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
    console.error('Strategy lab index:', err);
    return <PageError title="Could not load clients" />;
  }
}
