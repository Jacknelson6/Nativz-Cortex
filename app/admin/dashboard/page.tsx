import Link from 'next/link';
import { Search, Users, Lightbulb, Calendar, Clock, Building2, Sparkles, ArrowRight } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';

export default async function AdminDashboardPage() {
  try {
    const adminClient = createAdminClient();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Fetch stats in parallel
    const [
      clientsResult,
      ideasResult,
      ideasWeekResult,
      recentIdeasResult,
      clientsListResult,
    ] = await Promise.all([
      adminClient.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      adminClient.from('idea_submissions').select('id', { count: 'exact', head: true }).in('status', ['new', 'reviewed']),
      adminClient.from('idea_submissions').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
      adminClient
        .from('idea_submissions')
        .select('id, title, category, status, created_at, client_id, clients(name, slug)')
        .order('created_at', { ascending: false })
        .limit(8),
      adminClient
        .from('clients')
        .select('id, name, slug, logo_url, industry, is_active')
        .eq('is_active', true)
        .order('name')
        .limit(6),
    ]);

    const totalClients = clientsResult.count || 0;
    const pendingIdeas = ideasResult.count || 0;
    const ideasThisWeek = ideasWeekResult.count || 0;

    const rawIdeas = recentIdeasResult.data || [];
    const recentIdeas = rawIdeas.map((idea) => ({
      ...idea,
      clients: Array.isArray(idea.clients) ? idea.clients[0] ?? null : idea.clients ?? null,
    })) as Array<{
      id: string;
      title: string;
      category: string;
      status: string;
      created_at: string;
      client_id: string | null;
      clients: { name: string; slug: string } | null;
    }>;

    const clients = clientsListResult.data || [];

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">Your creative workshop</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            title="Active clients"
            value={String(totalClients)}
            icon={<Users size={20} />}
          />
          <StatCard
            title="Ideas to review"
            value={String(pendingIdeas)}
            icon={<Lightbulb size={20} />}
          />
          <StatCard
            title="Ideas this week"
            value={String(ideasThisWeek)}
            icon={<Sparkles size={20} />}
          />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/search/new">
            <Card interactive className="group">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-surface text-accent-text group-hover:bg-accent/20 transition-colors">
                  <Search size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Run research</p>
                  <p className="text-xs text-text-muted mt-0.5">Analyze trending topics and brand sentiment</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/admin/clients">
            <Card interactive className="group">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                  <Lightbulb size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Create ideas</p>
                  <p className="text-xs text-text-muted mt-0.5">Save content ideas and concepts for clients</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/admin/clients">
            <Card interactive className="group">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <Calendar size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Schedule sends</p>
                  <p className="text-xs text-text-muted mt-0.5">Plan and schedule research for upcoming shoots</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* Two column layout: Clients + Recent ideas */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Client projects */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">Client projects</h2>
              <Link href="/admin/clients" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {clients.length === 0 ? (
              <EmptyState
                icon={<Building2 size={24} />}
                title="No clients yet"
                description="Add your first client to get started."
              />
            ) : (
              <div className="space-y-2">
                {clients.map((client, i) => (
                  <Link key={client.id} href={`/admin/clients/${client.slug}`}>
                    <div
                      className="animate-stagger-in flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      {client.logo_url ? (
                        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={client.logo_url} alt={client.name} className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface text-accent-text">
                          <Building2 size={14} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
                        <p className="text-xs text-text-muted">{client.industry}</p>
                      </div>
                      <ArrowRight size={14} className="text-text-muted shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Recent ideas */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">Recent ideas</h2>
              {pendingIdeas > 0 && (
                <Badge variant="info">{pendingIdeas} to review</Badge>
              )}
            </div>
            {recentIdeas.length === 0 ? (
              <EmptyState
                icon={<Lightbulb size={24} />}
                title="No ideas yet"
                description="Ideas from research and your team will appear here."
              />
            ) : (
              <div className="space-y-2">
                {recentIdeas.map((idea, i) => (
                  <Link
                    key={idea.id}
                    href={idea.clients ? `/admin/clients/${idea.clients.slug}/ideas` : '#'}
                  >
                    <div
                      className="animate-stagger-in flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{idea.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-text-muted flex items-center gap-1">
                            <Clock size={10} />
                            {formatRelativeTime(idea.created_at)}
                          </span>
                          {idea.clients && (
                            <span className="text-xs text-text-muted flex items-center gap-1">
                              <Building2 size={10} />
                              {idea.clients.name}
                            </span>
                          )}
                        </div>
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
        </div>
      </div>
    );
  } catch (error) {
    console.error('AdminDashboardPage error:', error);
    return <PageError />;
  }
}
