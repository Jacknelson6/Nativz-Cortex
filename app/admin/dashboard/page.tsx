import Link from 'next/link';
import {
  Users,
  Search,
  Calendar,
  Image,
  ArrowRight,
  Camera,
  LayoutGrid,
  UserPlus,
  Clock,
  MapPin,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Activity,
} from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GlassButton } from '@/components/ui/glass-button';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';

function StatCard({
  icon,
  value,
  label,
  trend,
  accentClass = 'from-blue-500 to-purple-500',
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  trend?: number;
  accentClass?: string;
}) {
  return (
    <Card className="group relative overflow-hidden !p-5 transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5">
      <div className={`absolute inset-0 bg-gradient-to-br ${accentClass} opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-300`} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="rounded-lg bg-surface-elevated p-2 text-text-muted group-hover:text-text-secondary transition-colors">
            {icon}
          </div>
          {trend !== undefined && trend !== 0 && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
        <p className="mt-3 text-3xl font-bold text-text-primary tracking-tight">{value.toLocaleString()}</p>
        <p className="mt-0.5 text-sm text-text-muted">{label}</p>
      </div>
    </Card>
  );
}

const activityIcons: Record<string, React.ReactNode> = {
  search: <Search size={14} className="text-blue-400" />,
  shoot: <Camera size={14} className="text-purple-400" />,
  moodboard: <Image size={14} className="text-pink-400" />,
  client: <UserPlus size={14} className="text-emerald-400" />,
};

export default async function AdminDashboardPage() {
  try {
    const supabase = createAdminClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = now.toISOString().split('T')[0];
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    const [
      clientsCount,
      searchesThisMonth,
      searchesLastMonth,
      upcomingShootsCount,
      moodboardItemsCount,
      upcomingShootsList,
      recentSearchesList,
      recentClients,
      recentMoodboardItems,
      recentTopicSearches,
      recentShootEvents,
    ] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('topic_searches').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      supabase.from('topic_searches').select('id', { count: 'exact', head: true }).gte('created_at', lastMonth).lte('created_at', endOfLastMonth),
      supabase.from('shoot_events').select('id', { count: 'exact', head: true }).gte('shoot_date', today),
      supabase.from('moodboard_items').select('id', { count: 'exact', head: true }),
      supabase
        .from('shoot_events')
        .select('id, title, shoot_date, location, client_id, clients(name, slug)')
        .gte('shoot_date', today)
        .lte('shoot_date', nextWeek)
        .order('shoot_date')
        .limit(10),
      supabase
        .from('topic_searches')
        .select('id, query, search_type, status, created_at, client_id, clients(name, slug)')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('clients').select('id, name, slug, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('moodboard_items').select('id, title, created_at, moodboard_id').order('created_at', { ascending: false }).limit(5),
      supabase.from('topic_searches').select('id, query, created_at, client_id, clients(name)').order('created_at', { ascending: false }).limit(5),
      supabase.from('shoot_events').select('id, title, created_at, shoot_date, client_id, clients(name)').order('created_at', { ascending: false }).limit(5),
    ]);

    const totalClients = clientsCount.count || 0;
    const activeSearches = searchesThisMonth.count || 0;
    const lastMonthSearches = searchesLastMonth.count || 0;
    const upcomingShoots = upcomingShootsCount.count || 0;
    const moodboardItems = moodboardItemsCount.count || 0;

    const searchTrend = lastMonthSearches > 0 ? Math.round(((activeSearches - lastMonthSearches) / lastMonthSearches) * 100) : 0;

    // Build activity feed
    type ActivityItem = { type: string; id: string; description: string; created_at: string; link: string };
    const activity: ActivityItem[] = [];

    for (const s of recentTopicSearches.data || []) {
      const c = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      activity.push({ type: 'search', id: s.id, description: `Search: "${s.query}"${c ? ` · ${(c as { name: string }).name}` : ''}`, created_at: s.created_at, link: `/admin/search/${s.id}` });
    }
    for (const s of recentShootEvents.data || []) {
      const c = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      activity.push({ type: 'shoot', id: s.id, description: `Shoot: "${s.title}"${c ? ` · ${(c as { name: string }).name}` : ''}`, created_at: s.created_at, link: `/admin/shoots` });
    }
    for (const m of recentMoodboardItems.data || []) {
      activity.push({ type: 'moodboard', id: m.id, description: `Moodboard: "${m.title || 'Untitled'}"`, created_at: m.created_at, link: `/admin/moodboard` });
    }
    for (const c of recentClients.data || []) {
      activity.push({ type: 'client', id: c.id, description: `Client onboarded: ${c.name}`, created_at: c.created_at, link: `/admin/clients/${c.slug}` });
    }
    activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const activityFeed = activity.slice(0, 10);

    // Normalize shoots
    const shoots = (upcomingShootsList.data || []).map((s) => ({
      ...s,
      clients: (Array.isArray(s.clients) ? s.clients[0] : s.clients) as { name: string; slug: string } | null,
    }));

    // Normalize searches
    const searches = (recentSearchesList.data || []).map((s) => ({
      ...s,
      clients: (Array.isArray(s.clients) ? s.clients[0] : s.clients) as { name: string; slug: string } | null,
    }));

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              Command Center
            </h1>
            <p className="text-sm text-text-muted mt-0.5">Your content strategy at a glance</p>
          </div>
          <div className="text-xs text-text-muted">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Hero Stats Row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Users size={18} />}
            value={totalClients}
            label="Total Clients"
            accentClass="from-blue-500 to-purple-500"
          />
          <StatCard
            icon={<Search size={18} />}
            value={activeSearches}
            label="Searches This Month"
            trend={searchTrend}
            accentClass="from-blue-500 to-purple-500"
          />
          <StatCard
            icon={<Calendar size={18} />}
            value={upcomingShoots}
            label="Upcoming Shoots"
            accentClass="from-blue-500 to-purple-500"
          />
          <StatCard
            icon={<Image size={18} />}
            value={moodboardItems}
            label="Moodboard Items"
            accentClass="from-blue-500 to-purple-500"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'New Search', href: '/admin/search', icon: <Search size={16} /> },
            { label: 'Schedule Shoot', href: '/admin/shoots', icon: <Camera size={16} /> },
            { label: 'New Moodboard', href: '/admin/moodboard', icon: <LayoutGrid size={16} /> },
            { label: 'Onboard Client', href: '/admin/clients/onboard', icon: <UserPlus size={16} /> },
          ].map((action) => (
            <Link key={action.label} href={action.href}>
              <GlassButton className="w-full justify-start !py-2.5 !px-4 !text-sm !font-medium">
                {action.icon}
                {action.label}
              </GlassButton>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Activity Feed — spans 3 cols */}
          <div className="lg:col-span-3">
            <Card>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Activity size={16} className="text-blue-400" />
                  Recent Activity
                </h2>
              </div>
              {activityFeed.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">No recent activity</p>
              ) : (
                <div className="space-y-1">
                  {activityFeed.map((item, i) => (
                    <Link
                      key={`${item.type}-${item.id}`}
                      href={item.link}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150 hover:bg-surface-elevated group"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated">
                        {activityIcons[item.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-secondary truncate group-hover:text-text-primary transition-colors">
                          {item.description}
                        </p>
                      </div>
                      <span className="text-xs text-text-muted shrink-0 flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right sidebar — spans 2 cols */}
          <div className="lg:col-span-2 space-y-6">
            {/* Upcoming Shoots */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Calendar size={16} className="text-purple-400" />
                  Next 7 Days
                </h2>
                <Link href="/admin/shoots" className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              {shoots.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-6">No shoots this week</p>
              ) : (
                <div className="space-y-2">
                  {shoots.map((shoot) => {
                    const shootDate = new Date(shoot.shoot_date);
                    return (
                      <div
                        key={shoot.id}
                        className="flex items-center gap-3 rounded-lg border border-nativz-border px-3 py-2.5 hover:bg-surface-elevated transition-colors"
                      >
                        <div className="flex flex-col items-center justify-center rounded-lg bg-purple-500/10 px-2 py-1 min-w-[40px]">
                          <span className="text-sm font-bold text-purple-400 leading-none">{shootDate.getDate()}</span>
                          <span className="text-[8px] font-medium text-purple-400/60 uppercase">{shootDate.toLocaleDateString('en-US', { month: 'short' })}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-text-secondary truncate">{shoot.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {shoot.clients && (
                              <span className="text-xs text-text-muted">{shoot.clients.name}</span>
                            )}
                            {shoot.location && (
                              <span className="text-xs text-text-muted flex items-center gap-0.5">
                                <MapPin size={8} /> {shoot.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Recent Searches */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Search size={16} className="text-blue-400" />
                  Recent Searches
                </h2>
              </div>
              {searches.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-6">No searches yet</p>
              ) : (
                <div className="space-y-2">
                  {searches.map((search) => (
                    <Link
                      key={search.id}
                      href={`/admin/search/${search.id}`}
                      className="block rounded-lg border border-nativz-border px-3 py-2.5 hover:bg-surface-elevated transition-colors group"
                    >
                      <p className="text-sm text-text-secondary truncate group-hover:text-text-primary transition-colors">
                        &quot;{search.query}&quot;
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {search.clients && (
                          <Badge variant="info">{search.clients.name}</Badge>
                        )}
                        <Badge variant={search.search_type === 'brand' ? 'purple' : 'default'}>
                          {search.search_type === 'brand' ? 'Brand' : 'Topic'}
                        </Badge>
                        <span className="text-xs text-text-muted ml-auto">{formatRelativeTime(search.created_at)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('AdminDashboardPage error:', error);
    return <PageError />;
  }
}
