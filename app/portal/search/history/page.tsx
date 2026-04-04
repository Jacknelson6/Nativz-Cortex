import Link from 'next/link';
import { Search, FileX } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { PortalSearchHistoryFeed } from './portal-history-feed';

export const dynamic = 'force-dynamic';

export default async function PortalSearchHistoryPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    if (!result.client.feature_flags.can_view_reports) {
      return (
        <div className="flex flex-col items-center justify-center p-6 pt-24">
          <EmptyState
            icon={<FileX size={32} />}
            title="History is not enabled"
            description="Report viewing is not enabled for your account. Contact your team for access."
          />
        </div>
      );
    }

    return (
      <div className="cortex-page-gutter space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="ui-page-title">Search history</h1>
            <p className="text-sm text-text-muted mt-1">
              All topic research for {result.client.name}
            </p>
          </div>
          {result.client.feature_flags.can_search && (
            <Link
              href="/portal/search/new"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-surface px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-surface/80 transition-colors"
            >
              <Search size={16} />
              New search
            </Link>
          )}
        </div>

        <PortalSearchHistoryFeed clientId={result.client.id} />
      </div>
    );
  } catch (error) {
    console.error('PortalSearchHistoryPage error:', error);
    return <PageError />;
  }
}
