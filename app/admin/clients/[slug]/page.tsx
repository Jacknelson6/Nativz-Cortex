import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Settings, Search, Clock, Lightbulb } from 'lucide-react';
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

    // Fetch recent searches, ideas, and idea count in parallel
    const [{ data: searches }, { data: recentIdeas }, { count: ideaCount }] = await Promise.all([
      adminClient
        .from('topic_searches')
        .select('id, query, status, created_at, approved_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(20),
      adminClient
        .from('idea_submissions')
        .select('id, title, category, status, created_at, submitted_by')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(5),
      adminClient
        .from('idea_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .in('status', ['new', 'reviewed']),
    ]);

    const items = searches || [];
    const ideas = recentIdeas || [];

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin/clients" className="shrink-0 text-text-muted hover:text-text-secondary transition-colors">
              <ArrowLeft size={20} />
            </Link>
            {client.logo_url && (
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-nativz-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={client.logo_url} alt={client.name} className="h-full w-full object-contain" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold text-text-primary">{client.name}</h1>
                {!client.is_active && <Badge variant="warning" className="shrink-0">Inactive</Badge>}
              </div>
              <p className="truncate text-sm text-text-muted">{client.industry}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/admin/clients/${slug}/ideas`}>
              <Button variant="outline">
                <Lightbulb size={16} />
                Ideas
                {(ideaCount ?? 0) > 0 && (
                  <Badge variant="info" className="ml-1">{ideaCount}</Badge>
                )}
              </Button>
            </Link>
            <Link href={`/admin/clients/${slug}/settings`}>
              <Button variant="outline">
                <Settings size={16} />
                Settings
              </Button>
            </Link>
          </div>
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

        {/* Recent ideas */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Recent ideas</h2>
            <Link href={`/admin/clients/${slug}/ideas`}>
              <Button variant="outline" size="sm">
                <Lightbulb size={14} />
                View all
                {(ideaCount ?? 0) > 0 && (
                  <Badge variant="info" className="ml-1">{ideaCount}</Badge>
                )}
              </Button>
            </Link>
          </div>

          {ideas.length === 0 ? (
            <EmptyState
              icon={<Lightbulb size={24} />}
              title="No ideas yet"
              description={`Ideas submitted by ${client.name} or your team will appear here.`}
            />
          ) : (
            <div className="space-y-2">
              {ideas.map((idea) => (
                <Link key={idea.id} href={`/admin/clients/${slug}/ideas`}>
                  <div className="flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{idea.title}</p>
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(idea.created_at)}
                      </span>
                    </div>
                    <Badge variant={idea.status === 'new' ? 'info' : idea.status === 'accepted' ? 'success' : 'default'}>
                      {idea.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

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
