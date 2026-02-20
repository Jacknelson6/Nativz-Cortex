import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowLeft, Settings, Search, Clock } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    const adminClient = createAdminClient();

    const { data: client, error } = await adminClient
      .from('clients')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !client) {
      notFound();
    }

    // Fetch recent searches for this client
    const { data: searches } = await adminClient
      .from('topic_searches')
      .select('id, query, status, created_at, approved_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const items = searches || [];

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/clients" className="text-text-muted hover:text-text-secondary transition-colors">
              <ArrowLeft size={20} />
            </Link>
            {client.logo_url ? (
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                <Image src={client.logo_url} alt={client.name} fill className="object-cover" />
              </div>
            ) : null}
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">{client.name}</h1>
              <p className="text-sm text-text-muted">{client.industry}</p>
            </div>
            {!client.is_active && <Badge variant="warning">Inactive</Badge>}
          </div>
          <Link href={`/admin/clients/${slug}/settings`}>
            <Button variant="outline">
              <Settings size={16} />
              Settings
            </Button>
          </Link>
        </div>

        {/* Client info */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-text-muted">Industry</p>
            <p className="mt-1 text-sm font-medium text-text-primary">{client.industry}</p>
          </Card>
          <Card>
            <p className="text-sm text-text-muted">Target audience</p>
            <p className="mt-1 text-sm font-medium text-text-primary">{client.target_audience || 'Not set'}</p>
          </Card>
          <Card>
            <p className="text-sm text-text-muted">Brand voice</p>
            <p className="mt-1 text-sm font-medium text-text-primary">{client.brand_voice || 'Not set'}</p>
          </Card>
        </div>

        {/* Recent searches */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Recent searches</h2>
            <Link href={`/admin/search/new?client=${client.id}`}>
              <Button size="sm">
                <Search size={14} />
                New search
              </Button>
            </Link>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<Search size={24} />}
              title="No searches yet"
              description={`Run a search for ${client.name} to get started.`}
            />
          ) : (
            <div className="space-y-2">
              {items.map((search) => (
                <Link key={search.id} href={`/admin/search/${search.id}`}>
                  <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{search.query}</p>
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(search.created_at)}
                      </span>
                    </div>
                    {search.approved_at ? (
                      <Badge variant="success">Sent</Badge>
                    ) : search.status === 'completed' ? (
                      <Badge variant="warning">Not sent</Badge>
                    ) : (
                      <Badge>{search.status}</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  } catch (error) {
    console.error('AdminClientDetailPage error:', error);
    return <PageError />;
  }
}
