import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents } from '@/lib/format/money';
import { ProposalViewer } from '@/components/proposals/proposal-viewer';
import { renderMarkdownToNodes } from '@/lib/proposals/markdown';

export const dynamic = 'force-dynamic';

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: proposal } = await admin
    .from('proposals')
    .select(
      'id, slug, title, status, body_markdown, scope_statement, terms_markdown, total_cents, deposit_cents, currency, signer_name, signer_email, signer_title, sent_at, signed_at, paid_at, expires_at, stripe_payment_link_url',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) notFound();
  if (proposal.status === 'draft' || proposal.status === 'canceled') notFound();

  const { data: packages } = await admin
    .from('proposal_packages')
    .select('id, name, description, tier, monthly_cents, annual_cents, setup_cents, sort_order')
    .eq('proposal_id', proposal.id)
    .order('sort_order');

  const pkgIds = (packages ?? []).map((p) => p.id);
  const { data: deliverables } = pkgIds.length
    ? await admin
        .from('proposal_deliverables')
        .select('id, package_id, name, quantity, sort_order')
        .in('package_id', pkgIds)
        .order('sort_order')
    : { data: [] as never[] };

  const expired = proposal.expires_at && new Date(proposal.expires_at) < new Date();

  return (
    <ProposalViewer
      proposal={proposal}
      packages={packages ?? []}
      deliverables={deliverables ?? []}
      expired={Boolean(expired)}
      body={renderMarkdownToNodes(proposal.body_markdown ?? '')}
      terms={renderMarkdownToNodes(proposal.terms_markdown ?? '')}
      formatCents={(c, cur) => formatCents(c, cur ?? proposal.currency)}
    />
  );
}
