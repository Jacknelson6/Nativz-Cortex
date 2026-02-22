import Link from 'next/link';
import { Search, FileText, Clock, ArrowRight } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { PortalStrategyCard } from '@/components/portal/portal-strategy-card';

export const dynamic = 'force-dynamic';

export default async function PortalDashboardPage() {
  try {
    const result = await getPortalClient();

    if (!result) return null;

    const adminClient = createAdminClient();

    // Get user's name
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    let fullName = '';
    if (user) {
      const { data: userData } = await adminClient
        .from('users')
        .select('full_name')
        .eq('id', user.id)
        .single();
      fullName = userData?.full_name || '';
    }

    const { client, organizationId } = result;
    const canSearch = client.feature_flags.can_search;
    const canViewReports = client.feature_flags.can_view_reports;

    // Get all org clients for queries
    const { data: clients } = await adminClient
      .from('clients')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    const clientIds = (clients || []).map((c) => c.id);
    const clientName = clients?.[0]?.name || 'your company';

    // Fetch stats
    const [reportsResult, recentResult] = await Promise.all([
      canViewReports && clientIds.length > 0
        ? adminClient.from('topic_searches')
            .select('id', { count: 'exact', head: true })
            .in('client_id', clientIds)
            .not('approved_at', 'is', null)
        : Promise.resolve({ count: 0 }),
      canViewReports && clientIds.length > 0
        ? adminClient.from('topic_searches')
            .select('id, query, status, created_at, approved_at')
            .in('client_id', clientIds)
            .not('approved_at', 'is', null)
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
    ]);

    const totalReports = reportsResult.count || 0;
    const recentReports = ('data' in recentResult ? recentResult.data : []) || [];

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              Welcome back{fullName ? `, ${fullName.split(' ')[0]}` : ''}
            </h1>
            <p className="text-sm text-text-muted">{clientName}</p>
          </div>
          {canSearch && (
            <Link href="/portal/search/new">
              <Button>
                <Search size={16} />
                New search
              </Button>
            </Link>
          )}
        </div>

        {/* Stats */}
        {canViewReports && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              title="Reports"
              value={String(totalReports)}
              icon={<FileText size={20} />}
            />
            <StatCard
              title="Recent activity"
              value={recentReports.length > 0 ? formatRelativeTime(recentReports[0].created_at) : 'No activity'}
              icon={<Clock size={20} />}
            />
          </div>
        )}

        {/* Content strategy */}
        <PortalStrategyCard clientId={client.id} clientName={client.name} />

        {/* Recent reports */}
        {canViewReports && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">Recent reports</h2>
              <Link href="/portal/reports" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {recentReports.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">
                No reports yet. Your Nativz team will share them here when ready.
              </p>
            ) : (
              <div className="space-y-2">
                {recentReports.map((report) => (
                  <Link key={report.id} href={`/portal/search/${report.id}`}>
                    <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{report.query}</p>
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Clock size={10} />
                          {formatRelativeTime(report.created_at)}
                        </span>
                      </div>
                      <Badge variant="success">Ready</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    );
  } catch (error) {
    console.error('PortalDashboardPage error:', error);
    return <PageError />;
  }
}
