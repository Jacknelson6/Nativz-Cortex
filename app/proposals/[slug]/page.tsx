import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCents } from '@/lib/format/money';
import { ProposalViewer } from '@/components/proposals/proposal-viewer';
import { isValidSnapshot, type ProposalSnapshot } from '@/lib/proposals/snapshot';

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
      'id, slug, title, status, body_markdown, scope_statement, terms_markdown, total_cents, deposit_cents, currency, signer_name, signer_email, signer_title, sent_at, signed_at, paid_at, expires_at, stripe_payment_link_url, sent_snapshot',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!proposal) notFound();
  if (proposal.status === 'draft' || proposal.status === 'canceled') notFound();

  const snapshot = isValidSnapshot(proposal.sent_snapshot) ? (proposal.sent_snapshot as ProposalSnapshot) : null;

  let packages: Array<{
    id: string;
    name: string;
    description: string | null;
    tier: string | null;
    monthly_cents: number | null;
    annual_cents: number | null;
    setup_cents: number | null;
    sort_order: number;
  }>;
  let deliverables: Array<{
    id: string;
    package_id: string;
    name: string;
    quantity: string | null;
    sort_order: number;
  }>;

  if (snapshot) {
    packages = snapshot.packages.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      tier: p.tier,
      monthly_cents: p.monthly_cents,
      annual_cents: p.annual_cents,
      setup_cents: p.setup_cents,
      sort_order: p.sort_order,
    }));
    deliverables = snapshot.packages.flatMap((p) =>
      p.deliverables.map((d) => ({
        id: d.id,
        package_id: p.id,
        name: d.name,
        quantity: d.quantity,
        sort_order: d.sort_order,
      })),
    );
  } else {
    const { data: livePackages } = await admin
      .from('proposal_packages')
      .select('id, name, description, tier, monthly_cents, annual_cents, setup_cents, sort_order')
      .eq('proposal_id', proposal.id)
      .order('sort_order');
    packages = livePackages ?? [];
    const pkgIds = packages.map((p) => p.id);
    const { data: liveDeliverables } = pkgIds.length
      ? await admin
          .from('proposal_deliverables')
          .select('id, package_id, name, quantity, sort_order')
          .in('package_id', pkgIds)
          .order('sort_order')
      : { data: [] as never[] };
    deliverables = liveDeliverables ?? [];
  }

  const expired = proposal.expires_at && new Date(proposal.expires_at) < new Date();

  return (
    <ProposalViewer
      proposal={{
        id: proposal.id,
        slug: proposal.slug,
        status: proposal.status,
        title: snapshot?.title ?? proposal.title,
        scope_statement: snapshot?.scope_statement ?? proposal.scope_statement,
        total_cents: snapshot?.total_cents ?? proposal.total_cents,
        deposit_cents: snapshot?.deposit_cents ?? proposal.deposit_cents,
        currency: snapshot?.currency ?? proposal.currency,
        signer_name: proposal.signer_name,
        signer_email: proposal.signer_email,
        signer_title: proposal.signer_title,
        stripe_payment_link_url: proposal.stripe_payment_link_url,
        sent_at: proposal.sent_at,
        signed_at: proposal.signed_at,
        paid_at: proposal.paid_at,
      }}
      packages={packages}
      deliverables={deliverables}
      expired={Boolean(expired)}
      bodyMarkdown={snapshot?.body_markdown ?? proposal.body_markdown ?? ''}
      termsMarkdown={snapshot?.terms_markdown ?? proposal.terms_markdown ?? ''}
      formatCents={(c, cur) => formatCents(c, cur ?? (snapshot?.currency ?? proposal.currency))}
    />
  );
}
