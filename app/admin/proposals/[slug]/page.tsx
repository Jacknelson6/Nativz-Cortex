import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProposalDetail } from '@/components/admin/proposals/proposal-detail';

export const dynamic = 'force-dynamic';

export default async function ProposalDetailPage({
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
    .select(
      'id, slug, title, status, agency, signer_name, signer_email, signer_title, signer_legal_entity, signer_address, external_repo, external_folder, external_url, published_at, sent_at, viewed_at, signed_at, paid_at, stripe_payment_link_url, client_id, clients(name, slug), template_id',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) notFound();

  const [{ data: events }, { data: template }] = await Promise.all([
    admin
      .from('proposal_events')
      .select('type, occurred_at, metadata')
      .eq('proposal_id', proposal.id)
      .order('occurred_at', { ascending: false })
      .limit(50),
    proposal.template_id
      ? admin
          .from('proposal_templates')
          .select('id, name, agency, source_repo, source_folder, public_base_url')
          .eq('id', proposal.template_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const client = proposal.clients as { name?: string | null; slug?: string | null } | null;

  return (
    <ProposalDetail
      proposal={{
        id: proposal.id,
        slug: proposal.slug,
        title: proposal.title,
        status: proposal.status,
        agency: (proposal.agency as 'anderson' | 'nativz' | null) ?? 'nativz',
        signer_name: proposal.signer_name,
        signer_email: proposal.signer_email,
        signer_title: proposal.signer_title,
        signer_legal_entity: proposal.signer_legal_entity,
        signer_address: proposal.signer_address,
        external_repo: proposal.external_repo,
        external_folder: proposal.external_folder,
        external_url: proposal.external_url,
        published_at: proposal.published_at,
        sent_at: proposal.sent_at,
        viewed_at: proposal.viewed_at,
        signed_at: proposal.signed_at,
        paid_at: proposal.paid_at,
        stripe_payment_link_url: proposal.stripe_payment_link_url,
      }}
      clientName={client?.name ?? null}
      clientSlug={client?.slug ?? null}
      template={template as null | { name: string; source_repo: string; source_folder: string; public_base_url: string }}
      events={(events ?? []).map((e) => ({
        type: e.type,
        occurred_at: e.occurred_at,
        metadata: (e.metadata as Record<string, unknown> | null) ?? {},
      }))}
    />
  );
}
