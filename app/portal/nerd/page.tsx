import { Lock } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { PortalNerdClient } from './portal-nerd-client';

export const dynamic = 'force-dynamic';

export default async function PortalNerdPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    if ((client.feature_flags as unknown as Record<string, boolean>).can_use_nerd === false) {
      return (
        <div className="p-6">
          <EmptyState
            icon={<Lock size={24} />}
            title="The Nerd is not enabled"
            description="Contact your Nativz team to enable AI chat."
          />
        </div>
      );
    }

    return (
      <PortalNerdClient
        clientId={client.id}
        clientName={client.name}
        clientSlug={client.slug}
      />
    );
  } catch (error) {
    console.error('PortalNerdPage error:', error);
    return <PageError />;
  }
}
