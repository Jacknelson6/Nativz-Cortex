import { StatCard } from '@/components/shared/stat-card';
import { Heart, Eye, Users, MessageCircle, TrendingUp } from 'lucide-react';
import type { SearchMetrics } from '@/lib/types/search';
import { formatNumber } from '@/lib/utils/format';

interface MetricsRowProps {
  metrics: SearchMetrics;
}

export function MetricsRow({ metrics }: MetricsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        title="Engagements"
        value={formatNumber(metrics.total_engagements)}
        icon={<Heart size={18} />}
      />
      <StatCard
        title="Engagement rate"
        value={`${(metrics.engagement_rate * 100).toFixed(1)}%`}
        icon={<TrendingUp size={18} />}
      />
      <StatCard
        title="Est. views"
        value={formatNumber(metrics.estimated_views)}
        icon={<Eye size={18} />}
      />
      <StatCard
        title="Est. reach"
        value={formatNumber(metrics.estimated_reach)}
        icon={<Users size={18} />}
      />
      <StatCard
        title="Mentions"
        value={formatNumber(metrics.total_mentions)}
        icon={<MessageCircle size={18} />}
      />
    </div>
  );
}
