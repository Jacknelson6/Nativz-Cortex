import Link from 'next/link';
import { Search, Users, Clock, CheckCircle, ArrowRight } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';

export default async function AdminDashboardPage() {
  try {
    const adminClient = createAdminClient();

    // Fetch stats in parallel
    const [clientsResult, searchesResult, pendingResult, recentResult] = await Promise.all([
      adminClient.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      adminClient.from('topic_searches').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      adminClient.from('topic_searches').select('id', { count: 'exact', head: true }).eq('status', 'completed').is('approved_at', null),
      adminClient.from('topic_searches')
        .select('id, query, status, created_at, approved_at, client_id')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const totalClients = clientsResult.count || 0;
    const totalSearches = searchesResult.count || 0;
    const pendingApprovals = pendingResult.count || 0;
    const recentSearches = recentResult.data || [];

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <Link href="/admin/search/new">
            <Button>
              <Search size={16} />
              New search
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            title="Active clients"
            value={String(totalClients)}
            icon={<Users size={20} />}
          />
          <StatCard
            title="Total searches"
            value={String(totalSearches)}
            icon={<Search size={20} />}
          />
          <StatCard
            title="Pending approvals"
            value={String(pendingApprovals)}
            icon={<CheckCircle size={20} />}
          />
        </div>

        {/* Recent searches */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Recent searches</h2>
            <Link href="/admin/search/history" className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {recentSearches.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No searches yet. Run your first search to get started.</p>
          ) : (
            <div className="space-y-2">
              {recentSearches.map((search) => (
                <Link key={search.id} href={`/admin/search/${search.id}`}>
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Search size={14} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{search.query}</p>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={10} />
                          {formatRelativeTime(search.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {search.approved_at ? (
                        <Badge variant="success">Approved</Badge>
                      ) : search.status === 'completed' ? (
                        <Badge variant="warning">Pending review</Badge>
                      ) : (
                        <StatusBadge status={search.status} />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  } catch (error) {
    console.error('AdminDashboardPage error:', error);
    return <PageError />;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <Badge variant="success">Completed</Badge>;
    case 'processing':
      return <Badge variant="info">Processing</Badge>;
    case 'failed':
      return <Badge variant="danger">Failed</Badge>;
    default:
      return <Badge>Pending</Badge>;
  }
}
