import { SearchX } from 'lucide-react';
import { ResearchTopicForm } from '@/components/research/research-topic-form';
import { EmptyState } from '@/components/shared/empty-state';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { PortalRecentSearches } from './portal-recent-searches';

export const dynamic = 'force-dynamic';

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
    <div className="flex flex-col items-center px-6 sm:px-8" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
      <div className="w-full max-w-xl mt-[20vh]">
        <ResearchTopicForm
          clients={[{
            id: result.client.id,
            name: result.client.name,
            logo_url: null,
            agency: null,
          }]}
          portalMode
          fixedClientId={result.client.id}
          fixedClientName={result.client.name}
        />
      </div>

      {/* Recent searches below the form */}
      <div className="w-full max-w-xl mt-10 pb-12">
        <PortalRecentSearches clientId={result.client.id} />
      </div>
    </div>
  );
}
