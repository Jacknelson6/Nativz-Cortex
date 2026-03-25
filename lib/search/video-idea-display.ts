import type { VideoIdea } from '@/lib/types/search';

export function displayIdeaFormat(format: string | undefined | null): string {
  const t = (format ?? '').replace(/_/g, ' ').trim();
  return t || 'Not specified';
}

export function effectiveVirality(
  virality: VideoIdea['virality'] | undefined | null
): NonNullable<VideoIdea['virality']> {
  return virality ?? 'low';
}

export function displayIdeaVirality(virality: VideoIdea['virality'] | undefined | null): string {
  return String(effectiveVirality(virality)).replace(/_/g, ' ');
}
