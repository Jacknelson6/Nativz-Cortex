import Link from 'next/link';
import {
  Search,
  Users,
  Lightbulb,
  Calendar,
  Clock,
  Building2,
  ArrowRight,
  FileText,
  CheckCircle2,
  MapPin,
  User,
  RefreshCw,
  Check,
  Minus,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';
import { Suggestions, type Suggestion } from '@/components/dashboard/suggestions';
import { IdeaActions } from '@/components/dashboard/idea-actions';

export default async function AdminDashboardPage() {
  try {
    const adminClient = createAdminClient();

    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const twoWeeksOut = new Date();
    twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

    // Current month boundaries for shoot coverage tracker
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Fetch all data in parallel
    const [
      clientsResult,
      ideasCountResult,
      shootsCountResult,
      strategiesResult,
      reportsWeekResult,
      upcomingShootsResult,
      newIdeasResult,
      activeClientsResult,
      // For suggestions: clients with no search this week
      clientSearchesThisWeekResult,
      // For suggestions: shoots in next 7 days with no plan
      imminentShootsResult,
      // For suggestions: ideas pending review (grouped by client)
      pendingIdeasByClientResult,
      // For suggestions: stale strategies (> 30 days old)
      staleStrategiesResult,
      // For shoot coverage: all shoots this month
      monthShootsResult,
    ] = await Promise.all([
      // Stats
      adminClient.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      adminClient.from('idea_submissions').select('id', { count: 'exact', head: true }).in('status', ['new', 'reviewed']),
      adminClient.from('shoot_events').select('id', { count: 'exact', head: true }).gte('shoot_date', now.toISOString()),
      adminClient.from('client_strategies').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      adminClient.from('topic_searches').select('id', { count: 'exact', head: true }).gte('approved_at', weekAgo.toISOString()),

      // Upcoming shoots (next 14 days, for display)
      adminClient
        .from('shoot_events')
        .select('id, title, shoot_date, location, plan_status, client_id, clients(name, slug)')
        .gte('shoot_date', now.toISOString())
        .order('shoot_date')
        .limit(5),

      // New ideas (status = 'new' only) for the ideas section
      adminClient
        .from('idea_submissions')
        .select('id, title, category, status, description, created_at, client_id, clients(name, slug)')
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(8),

      // All active clients (for suggestions + shoot coverage)
      adminClient
        .from('clients')
        .select('id, name, slug, logo_url, industry')
        .eq('is_active', true)
        .order('name'),

      // Searches this week per client (for "no search this week" suggestion)
      adminClient
        .from('topic_searches')
        .select('client_id')
        .gte('created_at', weekAgo.toISOString())
        .eq('status', 'completed')
        .not('client_id', 'is', null),

      // Shoots in next 7 days without a plan
      adminClient
        .from('shoot_events')
        .select('id, title, shoot_date, client_id, plan_status, clients(name, slug)')
        .gte('shoot_date', now.toISOString())
        .lte('shoot_date', twoWeeksOut.toISOString())
        .in('plan_status', ['pending', 'skipped']),

      // New ideas grouped by client for suggestions
      adminClient
        .from('idea_submissions')
        .select('id, client_id, clients(name, slug)')
        .eq('status', 'new'),

      // Strategies older than 30 days (per client, only most recent)
      adminClient
        .from('client_strategies')
        .select('id, client_id, created_at, clients(name, slug)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),

      // All shoots this month for coverage tracker
      adminClient
        .from('shoot_events')
        .select('id, client_id, shoot_date')
        .gte('shoot_date', monthStart.toISOString())
        .lte('shoot_date', monthEnd.toISOString()),
    ]);

    // --- Stat card values ---
    const totalClients = clientsResult.count || 0;
    const pendingIdeas = ideasCountResult.count || 0;
    const upcomingShootsCount = shootsCountResult.count || 0;
    const strategiesGenerated = strategiesResult.count || 0;
    const reportsThisWeek = reportsWeekResult.count || 0;

    // --- Upcoming shoots ---
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

    // --- New ideas ---
    const rawNewIdeas = newIdeasResult.data || [];
    const newIdeas = rawNewIdeas.map((idea) => ({
      ...idea,
      clients: Array.isArray(idea.clients) ? idea.clients[0] ?? null : idea.clients ?? null,
    })) as Array<{
      id: string;
      title: string;
      category: string;
      status: string;
      description: string | null;
      created_at: string;
      client_id: string | null;
      clients: { name: string; slug: string } | null;
    }>;

    // --- Active clients list ---
    const activeClients = activeClientsResult.data || [];

    // --- Build suggestions from real data ---
    const suggestions: Suggestion[] = [];

    // 1. Clients with no search this week
    const clientIdsWithSearches = new Set(
      (clientSearchesThisWeekResult.data || [])
        .map((s) => s.client_id)
        .filter(Boolean)
    );
    const clientsWithoutSearch = activeClients.filter((c) => !clientIdsWithSearches.has(c.id));
    if (clientsWithoutSearch.length > 0) {
      const count = clientsWithoutSearch.length;
      const names = clientsWithoutSearch.slice(0, 2).map((c) => c.name);
      const suffix = count > 2 ? ` and ${count - 2} more` : '';
      suggestions.push({
        id: 'no-search-this-week',
        icon: <Search size={16} />,
        title: `${count} client${count !== 1 ? 's' : ''} ha${count !== 1 ? 've' : 's'}n't had research this week`,
        description: `${names.join(', ')}${suffix} — run a search to keep content fresh`,
        href: '/admin/search/new',
        priority: count >= 3 ? 'high' : 'normal',
        category: 'research',
      });
    }

    // 2. Shoots coming up without a content plan
    const rawImminentShoots = (imminentShootsResult.data || []).map((s) => ({
      ...s,
      clients: Array.isArray(s.clients) ? s.clients[0] ?? null : s.clients ?? null,
    })) as Array<{
      id: string;
      title: string;
      shoot_date: string;
      client_id: string | null;
      plan_status: string;
      clients: { name: string; slug: string } | null;
    }>;

    for (const shoot of rawImminentShoots) {
      const shootDate = new Date(shoot.shoot_date);
      const daysUntil = Math.max(0, Math.ceil((shootDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      if (daysUntil <= 7) {
        const clientName = shoot.clients?.name ?? 'Unknown client';
        const timeLabel = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
        suggestions.push({
          id: `shoot-no-plan-${shoot.id}`,
          icon: <Calendar size={16} />,
          title: `Shoot ${timeLabel} — no content plan yet`,
          description: `"${shoot.title}" for ${clientName} needs a plan before the shoot`,
          href: '/admin/shoots',
          priority: daysUntil <= 3 ? 'urgent' : 'high',
          category: 'shoot',
        });
      }
    }

    // 3. New ideas pending review (grouped by client)
    const rawPendingIdeas = (pendingIdeasByClientResult.data || []).map((idea) => ({
      ...idea,
      clients: Array.isArray(idea.clients) ? idea.clients[0] ?? null : idea.clients ?? null,
    })) as Array<{
      id: string;
      client_id: string | null;
      clients: { name: string; slug: string } | null;
    }>;

    const ideasByClient = new Map<string, { count: number; name: string; slug: string }>();
    for (const idea of rawPendingIdeas) {
      if (idea.clients) {
        const key = idea.clients.slug;
        const existing = ideasByClient.get(key);
        if (existing) {
          existing.count++;
        } else {
          ideasByClient.set(key, { count: 1, name: idea.clients.name, slug: idea.clients.slug });
        }
      }
    }

    for (const [slug, { count, name }] of ideasByClient) {
      suggestions.push({
        id: `ideas-pending-${slug}`,
        icon: <Lightbulb size={16} />,
        title: `${count} new idea${count !== 1 ? 's' : ''} pending review for ${name}`,
        description: `Review and triage submitted ideas to keep the content pipeline moving`,
        href: `/admin/clients/${slug}/ideas`,
        priority: count >= 3 ? 'high' : 'normal',
        category: 'ideas',
      });
    }

    // 4. Stale strategies (> 30 days since last strategy)
    const rawStrategies = (staleStrategiesResult.data || []).map((s) => ({
      ...s,
      clients: Array.isArray(s.clients) ? s.clients[0] ?? null : s.clients ?? null,
    })) as Array<{
      id: string;
      client_id: string;
      created_at: string;
      clients: { name: string; slug: string } | null;
    }>;

    // Get most recent strategy per client
    const latestStrategyByClient = new Map<string, { created_at: string; name: string; slug: string }>();
    for (const strategy of rawStrategies) {
      if (strategy.clients && !latestStrategyByClient.has(strategy.client_id)) {
        latestStrategyByClient.set(strategy.client_id, {
          created_at: strategy.created_at,
          name: strategy.clients.name,
          slug: strategy.clients.slug,
        });
      }
    }

    for (const [clientId, { created_at, name, slug }] of latestStrategyByClient) {
      const strategyDate = new Date(created_at);
      const daysSince = Math.floor((now.getTime() - strategyDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 30) {
        suggestions.push({
          id: `stale-strategy-${clientId}`,
          icon: <RefreshCw size={16} />,
          title: `Strategy hasn't been updated in ${daysSince} days for ${name}`,
          description: `The content strategy may be outdated — consider regenerating it`,
          href: `/admin/clients/${slug}`,
          priority: daysSince >= 60 ? 'high' : 'normal',
          category: 'strategy',
        });
      }
    }

    // Sort suggestions: urgent first, then high, then normal
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Cap at 6 suggestions
    const topSuggestions = suggestions.slice(0, 6);

    // --- Shoot coverage tracker ---
    const monthShoots = monthShootsResult.data || [];
    const clientIdsWithShoot = new Set(monthShoots.map((s) => s.client_id).filter(Boolean));
    const monthName = now.toLocaleDateString('en-US', { month: 'long' });
    const coveredCount = activeClients.filter((c) => clientIdsWithShoot.has(c.id)).length;
    const uncoveredCount = activeClients.length - coveredCount;

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">Your content strategy command center</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            title="Active clients"
            value={String(totalClients)}
            icon={<Users size={20} />}
          />
          <StatCard
            title="Upcoming shoots"
            value={String(upcomingShootsCount)}
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

        {/* AI-suggested next actions */}
        <Suggestions suggestions={topSuggestions} />

        {/* Monthly shoot coverage tracker */}
        {activeClients.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-text-primary">{monthName} shoot coverage</h2>
                <Badge variant={uncoveredCount === 0 ? 'success' : uncoveredCount >= 3 ? 'warning' : 'default'}>
                  {coveredCount}/{activeClients.length} covered
                </Badge>
              </div>
              <Link href="/admin/shoots" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
                Manage shoots <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {activeClients.map((client, i) => {
                const hasShoot = clientIdsWithShoot.has(client.id);
                return (
                  <div
                    key={client.id}
                    className={`animate-stagger-in flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${
                      hasShoot
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-nativz-border-light bg-surface'
                    }`}
                    style={{ animationDelay: `${i * 25}ms` }}
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      hasShoot
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-surface-hover text-text-muted'
                    }`}>
                      {hasShoot ? <Check size={10} strokeWidth={3} /> : <Minus size={10} />}
                    </div>
                    <span className={`text-xs font-medium truncate ${
                      hasShoot ? 'text-text-primary' : 'text-text-muted'
                    }`}>
                      {client.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Upcoming shoots */}
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

        {/* New video ideas */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text-primary">New video ideas</h2>
              {newIdeas.length > 0 && (
                <Badge variant="info">{newIdeas.length} to review</Badge>
              )}
            </div>
            {newIdeas.length > 0 && (
              <Link href="/admin/clients" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            )}
          </div>
          {newIdeas.length === 0 ? (
            <EmptyState
              icon={<Lightbulb size={24} />}
              title="No new ideas"
              description="When clients submit video ideas, they'll appear here for review."
            />
          ) : (
            <div className="space-y-2">
              {newIdeas.map((idea, i) => (
                <div
                  key={idea.id}
                  className="animate-stagger-in flex items-center justify-between rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover/50 transition-colors"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="min-w-0 flex-1">
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
                      <Badge variant="default">{idea.category.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                  <IdeaActions ideaId={idea.id} />
                </div>
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
