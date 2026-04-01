/**
 * Overlap metrics for shadow-mode parity between Supabase and TrustGraph results.
 */

export function overlapAtK(primaryIds: string[], shadowIds: string[], k: number): number {
  const a = new Set(primaryIds.slice(0, k));
  const b = shadowIds.slice(0, k);
  let hit = 0;
  for (const id of b) {
    if (a.has(id)) hit += 1;
  }
  return k === 0 ? 0 : hit / Math.min(k, Math.max(b.length, 1));
}

/** Jaccard similarity on two ID sets (order-insensitive). */
export function jaccardIds(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) {
    if (setB.has(x)) inter += 1;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}
