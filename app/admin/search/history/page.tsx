import Link from 'next/link';
import { Search, Clock, Building2, TrendingUp } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { HistoryFilters } from '@/components/search/history-filters';
import { formatRelativeTime } from '@/lib/utils/format';

export default async function AdminSearchHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; status?: string; approval?: string }>;
}) {
  const filters = await searchParams;

  try {
  const adminClient = createAdminClient();

  // Fetch clients for filter dropdown
  const { data: clientsList } = await adminClient
    .from('clients')
    .select('id, name')
    .order('name');

  const clients = clientsList || [];
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  // Build filtered query
  let query = adminClient
    .from('topic_searches')
    .select('id, query, source, time_range, status, created_at, completed_at, approved_at, client_id, search_mode')
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters.client) {
    query = query.eq('client_id', filters.client);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.approval === 'approved') {
    query = query.not('approved_at', 'is', null);
  } else if (filters.approval === 'pending') {
    query = query.is('approved_at', null).eq('status', 'completed');
  }

  const { data: searches } = await query;
  const items = searches || [];

  const hasFilters = filters.client || filters.status || filters.approval;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Search history</h1>
        <Link href="/admin/search/new">
          <Button>
            <Search size={16} />
            New search
          </Button>
        </Link>
      </div>

      <HistoryFilters clients={clients} />

      {items.length === 0 ? (
        <EmptyState
          icon={<Search size={32} />}
          title={hasFilters ? 'No matching searches' : 'No searches yet'}
          description={hasFilters ? 'Try adjusting your filters.' : 'Run your first topic search to get started.'}
          action={
            !hasFilters ? (
              <Link href="/admin/search/new">
                <Button>New search</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <Link key={item.id} href={`/admin/search/${item.id}`}>
              <Card
                interactive
                className="animate-stagger-in flex items-center justify-between"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-center gap-3">
                  <Search size={16} className="text-text-muted shrink-0" />
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
                      {item.client_id && clientMap.has(item.client_id) && (
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <Building2 size={10} />
                          {clientMap.get(item.client_id)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.search_mode === 'client_strategy' ? (
                    <Badge className="gap-1">
                      <Building2 size={10} />
                      Brand
                    </Badge>
                  ) : (
                    <Badge className="gap-1">
                      <TrendingUp size={10} />
                      Topic
                    </Badge>
                  )}
                  {item.approved_at ? (
                    <Badge variant="success">Sent</Badge>
                  ) : item.status === 'failed' ? (
                    <Badge variant="danger">Failed</Badge>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
  } catch (error) {
    console.error('AdminSearchHistoryPage error:', error);
    return <PageError />;
  }
}

