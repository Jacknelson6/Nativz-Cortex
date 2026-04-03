import { formatCompactCount } from '@/lib/utils/format';
import type { LegacyTrendingTopic, TrendingTopic } from '@/lib/types/search';

export const RESONANCE_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  viral: 'Viral',
};

export function getTopicReachValue(topic: TrendingTopic | LegacyTrendingTopic): number {
  if ('total_engagement' in topic && typeof (topic as TrendingTopic).total_engagement === 'number') {
    return Math.max(0, (topic as TrendingTopic).total_engagement ?? 0);
  }
  if ('estimated_views' in topic && typeof topic.estimated_views === 'number') {
    return Math.max(0, topic.estimated_views);
  }
  return 0;
}

export function formatTopicReach(topic: TrendingTopic | LegacyTrendingTopic): string {
  const v = getTopicReachValue(topic);
  if (v <= 0) return '—';
  return formatCompactCount(v);
}
