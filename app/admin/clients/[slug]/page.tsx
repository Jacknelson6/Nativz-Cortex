import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Settings, Search, Clock, Lightbulb, User2, Mail } from 'lucide-react';
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

    // Fetch searches, ideas, idea count, and contacts in parallel
    const [{ data: searches }, { data: recentIdeas }, { count: ideaCount }, { data: contacts }] = await Promise.all([
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
      // Fetch portal users linked to this client's organization
      client.organization_id
        ? adminClient
            .from('users')
            .select('id, full_name, email, avatar_url, job_title, last_login')
            .eq('organization_id', client.organization_id)
            .eq('role', 'viewer')
            .order('full_name')
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; email: string; avatar_url: string | null; job_title: string | null; last_login: string | null }> }),
    ]);

    const items = searches || [];
    const ideas = recentIdeas || [];
    const clientContacts = contacts || [];

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
                <img src={client.logo_url} alt={client.name} className="h-full w-full object-cover" />
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
              <Button variant="outline" size="sm">
                <Lightbulb size={14} />
                Ideas
                {(ideaCount ?? 0) > 0 && (
                  <Badge variant="info" className="ml-1">{ideaCount}</Badge>
                )}
              </Button>
            </Link>
            <Link href={`/admin/clients/${slug}/settings`}>
              <Button variant="outline" size="sm">
                <Settings size={14} />
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* Brand profile + Point of contact — side by side */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Brand profile (merged) */}
          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Brand profile</h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Industry</p>
                <p className="mt-1 text-sm text-text-primary">{client.industry}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Target audience</p>
                <p className="mt-1 text-sm text-text-primary">{client.target_audience || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Brand voice</p>
                <p className="mt-1 text-sm text-text-primary">{client.brand_voice || 'Not set'}</p>
              </div>
            </div>
          </Card>

          {/* Point of contact */}
          <Card>
            <h2 className="text-base font-semibold text-text-primary mb-4">Point of contact</h2>
            {clientContacts.length === 0 ? (
              <EmptyState
                icon={<User2 size={24} />}
                title="No accounts yet"
                description={`When ${client.name} creates a portal account, they'll appear here.`}
              />
            ) : (
              <div className="space-y-3">
                {clientContacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3">
                    {contact.avatar_url ? (
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={contact.avatar_url} alt={contact.full_name} className="h-full w-full object-cover scale-125" />
                      </div>
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent-text">
                        <User2 size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{contact.full_name}</p>
                      {contact.job_title && (
                        <p className="text-xs text-text-muted truncate">{contact.job_title}</p>
                      )}
                      <p className="text-xs text-text-muted flex items-center gap-1 truncate">
                        <Mail size={10} className="shrink-0" />
                        {contact.email}
                      </p>
                    </div>
                    {contact.last_login && (
                      <span className="text-xs text-text-muted shrink-0">
                        Active {formatRelativeTime(contact.last_login)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Saved ideas */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Saved ideas</h2>
            <Link href={`/admin/clients/${slug}/ideas`}>
              <Button size="sm">
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
