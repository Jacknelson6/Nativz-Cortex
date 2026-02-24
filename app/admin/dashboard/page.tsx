import Link from 'next/link';
import {
  Lightbulb,
  Calendar,
  Clock,
  Building2,
  ArrowRight,
  CheckCircle2,
  MapPin,
  User,
  Video,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatCard } from '@/components/shared/stat-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';
import { IdeaActions } from '@/components/dashboard/idea-actions';
import { ShootScheduleButton } from '@/components/dashboard/shoot-actions';

export default async function AdminDashboardPage() {
  try {
    const adminClient = createAdminClient();

    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Fetch all data in parallel
    const [
      ideasCountResult,
      shootsCountResult,
      reportsWeekResult,
      upcomingShootsResult,
      newIdeasResult,
      searchesThisWeekResult,
    ] = await Promise.all([
      // Stats
      adminClient.from('idea_submissions').select('id', { count: 'exact', head: true }).in('status', ['new', 'reviewed']),
      adminClient.from('shoot_events').select('id', { count: 'exact', head: true }).gte('shoot_date', now.toISOString()),
      adminClient.from('topic_searches').select('id', { count: 'exact', head: true }).gte('approved_at', weekAgo.toISOString()),

      // Upcoming shoots (next 30 days, for display)
      adminClient
        .from('shoot_events')
        .select('id, title, shoot_date, location, plan_status, client_id, monday_item_id, scheduled_status, clients(name, slug)')
        .gte('shoot_date', now.toISOString())
        .order('shoot_date')
        .limit(8),

      // New ideas (status = 'new' only) for the ideas section
      adminClient
        .from('idea_submissions')
        .select('id, title, category, status, description, created_at, client_id, clients(name, slug)')
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(8),

      // Searches completed this week
      adminClient
        .from('topic_searches')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString())
        .eq('status', 'completed'),
    ]);

    // --- Stat card values ---
    const pendingIdeas = ideasCountResult.count || 0;
    const upcomingShootsCount = shootsCountResult.count || 0;
    const reportsThisWeek = reportsWeekResult.count || 0;
    const searchesThisWeek = searchesThisWeekResult.count || 0;

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
      monday_item_id: string | null;
      scheduled_status: string | null;
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

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">Your content strategy command center</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            title="Upcoming shoots"
            value={String(upcomingShootsCount)}
            icon={<Calendar size={20} />}
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
          <StatCard
            title="Searches this week"
            value={String(searchesThisWeek)}
            icon={<Video size={20} />}
          />
        </div>

        {/* Ideas to review */}
        {newIdeas.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-text-primary">Ideas to review</h2>
                <Badge variant="info">{newIdeas.length} new</Badge>
              </div>
              <Link href="/admin/clients" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
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
          </Card>
        )}

        {/* Upcoming shoots */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-text-primary">Upcoming shoots</h2>
            <Link href="/admin/shoots" className="text-sm text-accent-text hover:text-accent-hover flex items-center gap-1">
              Manage shoots <ArrowRight size={14} />
            </Link>
          </div>
          {shoots.length === 0 ? (
            <div className="text-center py-8">
              <Calendar size={24} className="mx-auto text-text-muted mb-2" />
              <p className="text-sm text-text-muted">No upcoming shoots scheduled</p>
              <Link href="/admin/shoots" className="text-sm text-accent-text hover:text-accent-hover mt-1 inline-block">
                Schedule a shoot
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {shoots.map((shoot, i) => {
                const shootDate = new Date(shoot.shoot_date);
                const daysUntil = Math.max(0, Math.ceil((shootDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                const isUrgent = daysUntil <= 3;
                const isScheduled = shoot.scheduled_status === 'scheduled';

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

                    {/* Urgency label + action */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isUrgent && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">
                          {daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : `${daysUntil}d`}
                        </span>
                      )}
                      {isScheduled ? (
                        <span className="text-xs text-emerald-400 font-medium">Scheduled</span>
                      ) : (
                        <ShootScheduleButton
                          shoot={{
                            id: shoot.id,
                            title: shoot.title,
                            shoot_date: shoot.shoot_date,
                            location: shoot.location,
                            plan_status: shoot.plan_status,
                            client_id: shoot.client_id,
                            clientName: shoot.clients?.name ?? null,
                            clientSlug: shoot.clients?.slug ?? null,
                            mondayItemId: shoot.monday_item_id ?? undefined,
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
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
