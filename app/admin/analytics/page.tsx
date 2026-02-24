import { BarChart3, TrendingUp, Eye, Video } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { StatCard } from '@/components/shared/stat-card';
import { PageError } from '@/components/shared/page-error';
import { InstagramDashboard } from '@/components/analytics/instagram-dashboard';

export default async function AdminAnalyticsPage() {
  try {
    const adminClient = createAdminClient();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [searchesResult, approvedResult, clientsResult, ideasResult] = await Promise.all([
      adminClient
        .from('topic_searches')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString()),
      adminClient
        .from('topic_searches')
        .select('id', { count: 'exact', head: true })
        .not('approved_at', 'is', null)
        .gte('approved_at', thirtyDaysAgo.toISOString()),
      adminClient
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      adminClient
        .from('idea_submissions')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo.toISOString()),
    ]);

    return (
      <div className="p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Analytics</h1>
          <p className="text-sm text-text-muted mt-0.5">Performance metrics and content insights</p>
        </div>

        {/* Platform stats */}
        <div>
          <h2 className="text-lg font-medium text-text-primary mb-3">Platform overview</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              title="Searches (30d)"
              value={String(searchesResult.count ?? 0)}
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              title="Reports sent (30d)"
              value={String(approvedResult.count ?? 0)}
              icon={<Eye size={20} />}
            />
            <StatCard
              title="Active clients"
              value={String(clientsResult.count ?? 0)}
              icon={<BarChart3 size={20} />}
            />
            <StatCard
              title="Ideas (30d)"
              value={String(ideasResult.count ?? 0)}
              icon={<Video size={20} />}
            />
          </div>
        </div>

        {/* Instagram Analytics */}
        <div>
          <h2 className="text-lg font-medium text-text-primary mb-3">Instagram analytics</h2>
          <InstagramDashboard />
        </div>
      </div>
    );
  } catch (error) {
    console.error('AdminAnalyticsPage error:', error);
    return <PageError />;
  }
}
