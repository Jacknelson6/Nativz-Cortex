import Link from 'next/link';
import { Search, FileText, Clock, FileX } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';
import { getPortalClient } from '@/lib/portal/get-portal-client';

export const dynamic = 'force-dynamic';

export default async function PortalReportsPage() {
  try {
  const result = await getPortalClient();

  if (!result) return null;

  if (!result.client.feature_flags.can_view_reports) {
    return (
      <div className="flex flex-col items-center justify-center p-6 pt-24">
        <EmptyState
          icon={<FileX size={32} />}
          title="Reports are not enabled"
          description="Report viewing is not enabled for your account. Contact your Nativz team for access."
        />
      </div>
    );
  }

  const adminClient = createAdminClient();

  const { data: clients } = await adminClient
    .from('clients')
    .select('id')
    .eq('organization_id', result.organizationId)
    .eq('is_active', true);

  const clientIds = (clients || []).map((c) => c.id);

  // Fetch approved searches
  const { data: searches } = clientIds.length > 0
    ? await adminClient
        .from('topic_searches')
        .select('id, query, source, time_range, status, created_at, approved_at')
        .in('client_id', clientIds)
        .not('approved_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] };

  const items = searches || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Reports</h1>
        {result.client.feature_flags.can_search && (
          <Link href="/portal/search/new">
            <Button>
              <Search size={16} />
              New search
            </Button>
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText size={32} />}
          title="No reports yet"
          description="Topic research reports from your Nativz team will appear here."
        />
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <Link key={item.id} href={`/portal/search/${item.id}`}>
              <Card interactive className="animate-stagger-in flex items-center justify-between" style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-text-muted shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{item.query}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(item.created_at)}
                      </span>
                      {item.source !== 'all' && (
                        <span className="text-xs text-text-muted">{item.source}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge variant="success">Ready</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
  } catch (error) {
    console.error('PortalReportsPage error:', error);
    return <PageError />;
  }
}
