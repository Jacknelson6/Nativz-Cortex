import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProposalEditor } from '@/components/admin/proposals/proposal-editor';

export const dynamic = 'force-dynamic';

export default async function ProposalEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.is_super_admin === true || me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) redirect('/admin/dashboard');

  const { data: proposal } = await admin
    .from('proposals')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) notFound();

  const { data: packages } = await admin
    .from('proposal_packages')
    .select('*')
    .eq('proposal_id', proposal.id)
    .order('sort_order');

  const pkgIds = (packages ?? []).map((p) => p.id);
  const { data: deliverables } = pkgIds.length
    ? await admin.from('proposal_deliverables').select('*').in('package_id', pkgIds).order('sort_order')
    : { data: [] as never[] };

  const { data: clients } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('hide_from_roster', false)
    .order('name');

  const { data: events } = await admin
    .from('proposal_events')
    .select('type, occurred_at, metadata, ip')
    .eq('proposal_id', proposal.id)
    .order('occurred_at', { ascending: false })
    .limit(50);

  return (
    <ProposalEditor
      proposal={proposal}
      packages={packages ?? []}
      deliverables={deliverables ?? []}
      clients={(clients ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? 'Unnamed',
        slug: c.slug ?? '',
      }))}
      events={events ?? []}
    />
  );
}
