import { SearchX } from 'lucide-react';
import { SearchForm } from '@/components/search/search-form';
import { SearchHero } from '@/components/search/search-hero';
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
        <SearchHero />

        <div className="mt-8">
          <SearchForm
            redirectPrefix="/portal"
            fixedClientId={result.client.id}
            hideClientSelector
          />
        </div>

        <p className="mt-6 text-xs text-text-muted">
          Powered by Brave Search + Claude AI
        </p>
      </div>
    </div>
  );
}
