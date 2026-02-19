import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy h:mm a');
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatSentimentScore(score: number): string {
  if (score > 0.3) return 'Positive';
  if (score > -0.3) return 'Neutral';
  return 'Negative';
}

export function sentimentColor(score: number): string {
  if (score > 0.3) return 'text-emerald-500';
  if (score > -0.3) return 'text-amber-500';
  return 'text-red-500';
}

export function sentimentBgColor(score: number): string {
  if (score > 0.3) return 'bg-emerald-50 text-emerald-700';
  if (score > -0.3) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}
