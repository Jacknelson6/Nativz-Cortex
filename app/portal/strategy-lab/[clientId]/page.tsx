import { Lock } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { ContentLabNerdChat } from '@/components/content-lab/content-lab-nerd-chat';

export const dynamic = 'force-dynamic';

/**
 * Portal Strategy Lab page, keyed by clientId. We enforce that the :clientId
 * in the URL MUST match the user's org-bound client — anything else 404s so
 * a viewer can't navigate sideways into a different client's workspace even
 * if they guess a UUID.
 *
 * The content-lab feature rides the same `can_use_nerd` flag as the portal
 * Nerd — if an org has the Nerd off, Strategy Lab is off too. If that turns
 * out to be wrong we can split it into its own flag later.
 */
export default async function PortalContentLabPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  try {
    const { clientId } = await params;
    const portal = await getPortalClient();
    if (!portal) redirect('/admin/login');

    if (portal.client.id !== clientId) notFound();

    if (!portal.client.feature_flags.can_use_nerd) {
      return (
        <div className="cortex-page-gutter">
          <EmptyState
            icon={<Lock size={24} />}
            title="Strategy Lab is not enabled"
            description="Contact your team to enable AI content tools."
          />
        </div>
      );
    }

    return (
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        <ContentLabNerdChat
          clientId={portal.client.id}
          clientName={portal.client.name}
          clientSlug={portal.client.slug}
          portalMode
        />
      </div>
    );
  } catch (error) {
    console.error('PortalContentLabPage error:', error);
    return <PageError />;
  }
}
