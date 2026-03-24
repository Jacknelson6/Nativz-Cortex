import type { AdCreative } from '@/lib/ad-creatives/types';

function batchItemIndex(c: AdCreative): number | null {
  const v = c.metadata?.batch_item_index;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Gallery / client-wide list: newest first, stable tie-break on id.
 * Matches GET /api/clients/[id]/ad-creatives default ordering.
 */
export function compareAdCreativesGallery(a: AdCreative, b: AdCreative): number {
  const cmp = b.created_at.localeCompare(a.created_at);
  if (cmp !== 0) return cmp;
  return b.id.localeCompare(a.id);
}

export function sortAdCreativesForGallery(creatives: AdCreative[]): AdCreative[] {
  return [...creatives].sort(compareAdCreativesGallery);
}

/**
 * Single batch: preserve wizard / work-queue order via `metadata.batch_item_index`
 * when present; otherwise fall back to creation time (parallel runs may interleave).
 */
export function compareAdCreativesBatchOrder(a: AdCreative, b: AdCreative): number {
  const ia = batchItemIndex(a);
  const ib = batchItemIndex(b);
  if (ia !== null && ib !== null && ia !== ib) return ia - ib;
  if (ia !== null && ib === null) return -1;
  if (ia === null && ib !== null) return 1;
  const t = a.created_at.localeCompare(b.created_at);
  if (t !== 0) return t;
  return a.id.localeCompare(b.id);
}

export function sortAdCreativesForBatch(creatives: AdCreative[]): AdCreative[] {
  return [...creatives].sort(compareAdCreativesBatchOrder);
}
