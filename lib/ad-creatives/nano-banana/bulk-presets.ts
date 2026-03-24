/**
 * Shared Meta-style weighted template mix for large Nano Banana batches.
 * Matches `scripts/generate-goldback-meta-100.ts` at N=100; scales proportionally for other counts.
 */

import { NANO_BANANA_CATALOG } from './catalog-data';
import type { GlobalTemplateVariation } from '../types';

/** Base weights (sum = 100) — interleaved round-robin order matches the Goldback CLI batch. */
export const META_PERFORMANCE_BUCKETS_BASE: { slug: string; n: number }[] = [
  { slug: 'value-stack', n: 11 },
  { slug: 'stat-hero', n: 11 },
  { slug: 'headline', n: 9 },
  { slug: 'ugc-handheld', n: 9 },
  { slug: 'soft-gradient-product', n: 9 },
  { slug: 'price-anchor', n: 7 },
  { slug: 'deadline-urgency', n: 7 },
  { slug: 'split-screen', n: 6 },
  { slug: 'feature-callout', n: 6 },
  { slug: 'big-number', n: 5 },
  { slug: 'testimonial-card', n: 4 },
  { slug: 'notification-stack', n: 4 },
  { slug: 'press-quote', n: 4 },
  { slug: 'carousel-hint', n: 4 },
  { slug: 'story-panels', n: 4 },
];

const BASE_TOTAL = META_PERFORMANCE_BUCKETS_BASE.reduce((s, b) => s + b.n, 0);

/** Optional global style line aligned with the Goldback Meta batch script (no per-file paths). */
export const NANO_BULK_META_STYLE_DIRECTION =
  'Meta static — high legibility at small sizes; single primary CTA; product must match reference photo exactly.';

const SORT_ORDER_BY_SLUG = new Map(NANO_BANANA_CATALOG.map((e) => [e.slug, e.sortOrder]));

function interleaveSlugs(buckets: { slug: string; n: number }[]): string[] {
  const copies = buckets.map((b) => ({ slug: b.slug, left: b.n }));
  const out: string[] = [];
  while (copies.some((c) => c.left > 0)) {
    for (const c of copies) {
      if (c.left > 0) {
        out.push(c.slug);
        c.left -= 1;
      }
    }
  }
  return out;
}

function allocateProportional(
  buckets: { slug: string; weight: number }[],
  targetTotal: number,
): { slug: string; n: number }[] {
  if (targetTotal <= 0) return buckets.map((b) => ({ slug: b.slug, n: 0 }));
  const wsum = buckets.reduce((s, b) => s + b.weight, 0);
  if (wsum <= 0) return buckets.map((b) => ({ slug: b.slug, n: 0 }));

  const rows = buckets.map((b) => {
    const exact = (b.weight / wsum) * targetTotal;
    return { slug: b.slug, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  const nBySlug = new Map(rows.map((r) => [r.slug, r.floor]));
  let assigned = rows.reduce((s, r) => s + r.floor, 0);
  let need = targetTotal - assigned;
  const sortedIdx = rows
    .map((r, i) => ({ i, frac: r.frac }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < need; k++) {
    const slug = rows[sortedIdx[k % sortedIdx.length].i].slug;
    nBySlug.set(slug, (nBySlug.get(slug) ?? 0) + 1);
  }
  return buckets.map((b) => ({ slug: b.slug, n: nBySlug.get(b.slug) ?? 0 }));
}

/**
 * Ordered list of Nano slugs for one batch — interleaved so the mix matches feed-style pacing.
 */
export function buildMetaPerformanceSlotOrder(totalAds: number): string[] {
  if (totalAds < 1) return [];
  if (totalAds === BASE_TOTAL) {
    return interleaveSlugs(META_PERFORMANCE_BUCKETS_BASE);
  }
  const weights = META_PERFORMANCE_BUCKETS_BASE.map((b) => ({ slug: b.slug, weight: b.n }));
  const allocated = allocateProportional(weights, totalAds).filter((b) => b.n > 0);
  return interleaveSlugs(allocated);
}

/** Collapse slot order into `{ slug, count }[]` sorted by catalog `sortOrder` (wizard / API body). */
export function aggregateSlotOrderToGlobalVariations(slotOrder: string[]): GlobalTemplateVariation[] {
  const counts = new Map<string, number>();
  for (const s of slotOrder) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => (SORT_ORDER_BY_SLUG.get(a[0]) ?? 999) - (SORT_ORDER_BY_SLUG.get(b[0]) ?? 999))
    .map(([slug, count]) => ({ slug, count }));
}

/** True when `gtv` counts match how often each slug appears in `slotOrder`. */
export function globalSlotOrderMatchesVariations(
  slotOrder: string[],
  gtv: GlobalTemplateVariation[],
): boolean {
  if (slotOrder.length === 0) return false;
  const agg = new Map<string, number>();
  for (const s of slotOrder) agg.set(s, (agg.get(s) ?? 0) + 1);
  const gtvMap = new Map(gtv.map((g) => [g.slug, g.count]));
  if (agg.size !== gtvMap.size) return false;
  for (const [slug, n] of agg) {
    if (gtvMap.get(slug) !== n) return false;
  }
  for (const slug of gtvMap.keys()) {
    if (!agg.has(slug)) return false;
  }
  return true;
}
