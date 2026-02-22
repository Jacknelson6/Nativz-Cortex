import Link from 'next/link';
import { Search, Users, Lightbulb, Calendar, Clock, Building2, Sparkles, ArrowRight, FileText, CheckCircle2, MapPin, User } from 'lucide-react';
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

    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksOut = new Date();
    twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

    // Fetch stats in parallel
    const [
      clientsResult,
      ideasResult,
      shootsResult,
      strategiesResult,
      reportsWeekResult,
      recentIdeasResult,
      clientsListResult,
      upcomingShootsResult,
    ] = await Promise.all([
      adminClient.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      adminClient.from('idea_submissions').select('id', { count: 'exact', head: true }).in('status', ['new', 'reviewed']),
      adminClient.from('shoot_events').select('id', { count: 'exact', head: true }).gte('shoot_date', now.toISOString()),
      adminClient.from('client_strategies').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      adminClient.from('topic_searches').select('id', { count: 'exact', head: true }).gte('approved_at', weekAgo.toISOString()),
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
      adminClient
        .from('shoot_events')
        .select('id, title, shoot_date, location, plan_status, client_id, clients(name, slug)')
        .gte('shoot_date', now.toISOString())
        .order('shoot_date')
        .limit(5),
    ]);

    const totalClients = clientsResult.count || 0;
    const pendingIdeas = ideasResult.count || 0;
    const upcomingShoots = shootsResult.count || 0;
    const strategiesGenerated = strategiesResult.count || 0;
    const reportsThisWeek = reportsWeekResult.count || 0;

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

    const rawShoots = upcomingShootsResult.data || [];
    const shoots = rawShoots.map((s) => ({
      ...s,
      clients: Array.isArray(s.clients) ? s.clients[0] ?? null : s.clients ?? null,
    })) as Array<{
      id: string;
      title: string;
      shoot_date: string;
      location: string | null;
      plan_status: string;
      client_id: string | null;
      clients: { name: string; slug: string } | null;
    }>;

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">Your content strategy command center</p>
        </div>

        {/* Stats — 5 cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            title="Active clients"
            value={String(totalClients)}
            icon={<Users size={20} />}
          />
          <StatCard
            title="Upcoming shoots"
            value={String(upcomingShoots)}
            icon={<Calendar size={20} />}
          />
          <StatCard
            title="Strategies generated"
            value={String(strategiesGenerated)}
            icon={<FileText size={20} />}
          />
          <StatCard
            title="Ideas to review"
            value={String(pendingIdeas)}
            icon={<Lightbulb size={20} />}
          />
          <StatCard
            title="Reports this week"
            value={String(reportsThisWeek)}
            icon={<CheckCircle2 size={20} />}
          />
        </div>

        {/* Quick actions — 4 cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

          <Link href="/admin/shoots">
            <Card interactive className="group">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <Calendar size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Schedule shoot</p>
                  <p className="text-xs text-text-muted mt-0.5">Plan upcoming shoot events for clients</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/admin/clients/onboard">
            <Card interactive className="group">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                  <Sparkles size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Onboard client</p>
                  <p className="text-xs text-text-muted mt-0.5">Set up a new client with AI strategy</p>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/admin/clients">
            <Card interactive className="group">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                  <FileText size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">View strategies</p>
                  <p className="text-xs text-text-muted mt-0.5">Browse client content strategies</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>

        {/* Upcoming shoots section */}
        {shoots.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-primary">Upcoming shoots</h2>
              <Link href="/admin/shoots" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <div className="space-y-2">
              {shoots.map((shoot, i) => {
                const shootDate = new Date(shoot.shoot_date);
                const daysUntil = Math.max(0, Math.ceil((shootDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                const isUrgent = daysUntil <= 3;
                const statusConfig: Record<string, { label: string; color: string }> = {
                  pending: { label: 'No plan', color: 'text-text-muted' },
                  generating: { label: 'Generating...', color: 'text-accent' },
                  sent: { label: 'Plan ready', color: 'text-emerald-400' },
                  skipped: { label: 'Skipped', color: 'text-text-muted' },
                };
                const status = statusConfig[shoot.plan_status] ?? statusConfig.pending;

                return (
                  <div
                    key={shoot.id}
                    className="animate-stagger-in flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {/* Date badge */}
                    <div className={`
                      flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 min-w-[48px]
                      ${isUrgent ? 'bg-red-500/10 text-red-400' : 'bg-accent/10 text-accent'}
                    `}>
                      <span className="text-base font-bold leading-none">
                        {shootDate.getDate()}
                      </span>
                      <span className="text-[9px] font-medium uppercase mt-0.5">
                        {shootDate.toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{shoot.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {shoot.clients && (
                          <span className="text-xs text-text-muted flex items-center gap-1">
                            <User size={10} />
                            {shoot.clients.name}
                          </span>
                        )}
                        {shoot.location && (
                          <span className="text-xs text-text-muted flex items-center gap-1">
                            <MapPin size={10} />
                            {shoot.location}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Days until + status */}
                    <div className="flex items-center gap-3 shrink-0">
                      {isUrgent && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">
                          {daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : `${daysUntil}d`}
                        </span>
                      )}
                      <span className={`text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

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
