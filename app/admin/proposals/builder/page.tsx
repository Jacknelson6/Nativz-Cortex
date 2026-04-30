import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProposalBuilderClient } from '@/components/admin/proposals/proposal-builder-client';
import { ProposalBuilderStart } from '@/components/admin/proposals/proposal-builder-start';

export const dynamic = 'force-dynamic';

/**
 * /admin/proposals/builder — chat-driven proposal builder.
 *
 * Two modes:
 *   - No ?draft= param: render the start screen (agency / client / title).
 *   - ?draft=<uuid>: render the split-pane builder (left: structured
 *     pickers + service catalog, right: live preview iframe). Admin can
 *     also drive everything via Nerd chat — the same tools fire from
 *     /admin/nerd and mutate the same draft.
 */
export default async function ProposalBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; flowId?: string; clientSlug?: string }>;
}) {
  const sp = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  if (!sp.draft) {
    // `hide_from_roster` filter intentionally omitted: the column is
    // gated behind migration 054 and is missing on this snapshot. With
    // the filter, PostgREST errors and the picker shows zero clients.
    const { data: clients } = await admin
      .from('clients')
      .select('id, name, slug, logo_url, agency')
      .order('name');

    let prefillClientId: string | null = null;
    let prefillAgency: 'anderson' | 'nativz' | null = null;
    if (sp.clientSlug) {
      const match = (clients ?? []).find((c) => c.slug === sp.clientSlug);
      if (match) {
        prefillClientId = match.id as string;
        prefillAgency = (match.agency as 'anderson' | 'nativz' | null) ?? null;
      }
    }

    return (
      <div className="cortex-page-gutter max-w-3xl mx-auto py-8 space-y-6">
        <ProposalBuilderStart
          clients={(clients ?? []).map((c) => ({
            id: c.id as string,
            name: (c.name as string) ?? 'Unnamed',
            slug: (c.slug as string) ?? '',
            logo_url: c.logo_url as string | null,
            agency: c.agency as 'anderson' | 'nativz' | null,
          }))}
          prefillClientId={prefillClientId}
          prefillAgency={prefillAgency}
          flowId={sp.flowId ?? null}
        />
      </div>
    );
  }

  // Validate the draft + load services for the picker.
  const { data: draft } = await admin
    .from('proposal_drafts')
    .select('*, clients(name, slug, logo_url, agency)')
    .eq('id', sp.draft)
    .maybeSingle();
  if (!draft) redirect('/admin/proposals/builder');

  const { data: services } = await admin
    .from('proposal_services')
    .select('id, slug, name, category, description, billing_unit, base_unit_price_cents, included_items')
    .eq('agency', draft.agency)
    .eq('active', true)
    .order('category')
    .order('name');

  return (
    <ProposalBuilderClient
      draft={draft as never}
      services={(services ?? []) as never}
    />
  );
}
