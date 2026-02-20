import Link from 'next/link';
import { Search, Users, Clock, Send, ArrowRight, BarChart3, Building2 } from 'lucide-react';
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

    // "This week" boundary
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Fetch stats in parallel
    const [
      clientsResult,
      searchesResult,
      pendingResult,
      weekResult,
      recentResult,
    ] = await Promise.all([
      adminClient.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      adminClient.from('topic_searches').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      adminClient.from('topic_searches').select('id', { count: 'exact', head: true }).eq('status', 'completed').is('approved_at', null),
      adminClient.from('topic_searches').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('created_at', weekAgo.toISOString()),
      adminClient.from('topic_searches')
        .select('id, query, status, created_at, approved_at, client_id, clients(name, slug)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const totalClients = clientsResult.count || 0;
    const totalSearches = searchesResult.count || 0;
    const pendingSends = pendingResult.count || 0;
    const searchesThisWeek = weekResult.count || 0;
    const rawSearches = recentResult.data || [];
    const recentSearches = rawSearches.map((s) => ({
      ...s,
      clients: Array.isArray(s.clients) ? s.clients[0] ?? null : s.clients ?? null,
    })) as Array<{
      id: string;
      query: string;
      status: string;
      created_at: string;
      approved_at: string | null;
      client_id: string | null;
      clients: { name: string; slug: string } | null;
    }>;

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
          <Link href="/admin/search/new">
            <Button>
              <Search size={16} />
              New search
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            title="Active clients"
            value={String(totalClients)}
            icon={<Users size={20} />}
          />
          <StatCard
            title="This week"
            value={String(searchesThisWeek)}
            subtitle={`${totalSearches} total`}
            icon={<BarChart3 size={20} />}
          />
          <StatCard
            title="Ready to send"
            value={String(pendingSends)}
            icon={<Send size={20} />}
          />
          <StatCard
            title="Total reports"
            value={String(totalSearches)}
            icon={<Search size={20} />}
          />
        </div>

        {/* Ready to send — quick action */}
        {pendingSends > 0 && (
          <Link href="/admin/search/history">
            <Card interactive className="border-accent/20 bg-accent-surface/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
                    <Send size={18} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {pendingSends} {pendingSends === 1 ? 'report' : 'reports'} ready to send
                    </p>
                    <p className="text-xs text-text-muted">Review and send to clients</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-text-muted" />
              </div>
            </Card>
          </Link>
        )}

        {/* Recent searches */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Recent searches</h2>
            <Link href="/admin/search/history" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {recentSearches.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">No searches yet. Run your first search to get started.</p>
          ) : (
            <div className="space-y-2">
              {recentSearches.map((search, index) => (
                <Link key={search.id} href={`/admin/search/${search.id}`}>
                  <div className="animate-stagger-in flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors" style={{ animationDelay: `${index * 40}ms` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Search size={14} className="text-text-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{search.query}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-text-muted flex items-center gap-1">
                            <Clock size={10} />
                            {formatRelativeTime(search.created_at)}
                          </span>
                          {search.clients && (
                            <span className="text-xs text-text-muted flex items-center gap-1">
                              <Building2 size={10} />
                              {search.clients.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {search.approved_at ? (
                        <Badge variant="success">Sent</Badge>
                      ) : search.status === 'completed' ? (
                        <Badge variant="warning">Not sent</Badge>
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
