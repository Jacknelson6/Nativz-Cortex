import { SearchX } from 'lucide-react';
import { SearchForm } from '@/components/search/search-form';
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
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          Search a topic
        </h1>
        <p className="mt-2 text-gray-500">
          Enter a topic to get AI-powered research, trending insights, and video ideas
        </p>

        <div className="mt-8">
          <SearchForm
            redirectPrefix="/portal"
            fixedClientId={result.client.id}
            hideClientSelector
          />
        </div>

        <p className="mt-6 text-xs text-gray-400">
          Powered by Brave Search + Claude AI
        </p>
      </div>
    </div>
  );
}
