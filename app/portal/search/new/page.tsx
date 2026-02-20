import { SearchX } from 'lucide-react';
import { SearchModeSelector } from '@/components/search/search-mode-selector';
import { EmptyState } from '@/components/shared/empty-state';
import { getPortalClient } from '@/lib/portal/get-portal-client';

export default async function PortalNewSearchPage() {
  const result = await getPortalClient();

  if (!result) return null;

  if (!result.client.feature_flags.can_search) {
    return (
      <div className="flex flex-col items-center justify-center p-6 pt-24">
        <EmptyState
          icon={<SearchX size={32} />}
          title="Topic search is not enabled"
          description="Topic search is not enabled for your account. Contact your Nativz team for access."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 pt-16">
      <div className="w-full max-w-4xl">
        <SearchModeSelector
          redirectPrefix="/portal"
          fixedClientId={result.client.id}
          fixedClientName={result.client.name}
          portalMode
        />
      </div>
    </div>
  );
}
