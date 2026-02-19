export function getSentimentColorClass(score: number): string {
  if (score > 0.3) return 'text-emerald-600';
  if (score > -0.3) return 'text-amber-600';
  return 'text-red-600';
}

export function getSentimentBadgeVariant(score: number): 'success' | 'warning' | 'danger' {
  if (score > 0.3) return 'success';
  if (score > -0.3) return 'warning';
  return 'danger';
}

export function getSentimentLabel(score: number): string {
  if (score >= 0.6) return 'Very Positive';
  if (score >= 0.2) return 'Positive';
  if (score >= -0.2) return 'Neutral';
  if (score >= -0.6) return 'Negative';
  return 'Very Negative';
}

export function getSentimentEmoji(score: number): string {
  if (score >= 0.6) return '😊';
  if (score >= 0.2) return '🙂';
  if (score >= -0.2) return '😐';
  if (score >= -0.6) return '😟';
  return '😠';
}

export const EMOTION_COLORS: Record<string, string> = {
  excitement: '#10B981',
  frustration: '#EF4444',
  curiosity: '#6366F1',
  fomo: '#F59E0B',
  skepticism: '#8B5CF6',
  trust: '#3B82F6',
  anger: '#DC2626',
  joy: '#22C55E',
  surprise: '#EC4899',
  sadness: '#64748B',
};

export const FORMAT_LABELS: Record<string, string> = {
  talking_head: 'Talking Head',
  broll_montage: 'B-Roll Montage',
  ugc_style: 'UGC Style',
  duet_response: 'Duet Response',
  green_screen: 'Green Screen',
  street_interview: 'Street Interview',
  day_in_the_life: 'Day in the Life',
  before_after: 'Before & After',
  tutorial: 'Tutorial',
  myth_bust: 'Myth Bust',
};

export const VIRALITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-emerald-100 text-emerald-700',
  viral_potential: 'bg-purple-100 text-purple-700',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
};

export const IDEA_STATUS_LABELS: Record<string, string> = {
  idea: 'Idea',
  approved: 'Approved',
  in_production: 'In Production',
  published: 'Published',
  archived: 'Archived',
};
