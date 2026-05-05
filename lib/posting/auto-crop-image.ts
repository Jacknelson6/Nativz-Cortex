/**
 * Auto-crop planning helpers shared by client (canvas) and server (sharp).
 *
 * Two cases trigger a crop:
 *
 * 1. **Hard rescue**: source ratio is outside Instagram's 0.75-1.91 bounds.
 *    Without a crop Zernio rejects the IG leg with a deterministic 400 and
 *    we burn 3 retries plus an admin alert before the post is marked failed.
 *
 * 2. **Soft snap** (client-only by default): source ratio is *close* (within
 *    5%) to a canonical short-form aspect (4:5, 1:1, 1.91:1). Captures the
 *    "1080x1090 should clearly be 1:1" case without molesting deliberate
 *    weird ratios like a 4:3 product shot.
 *
 * Server-side callers should pass `strict: true` so only the hard rescue
 * fires; we don't want the publish path silently re-cropping artwork the
 * user already approved.
 */
export const CANONICAL_RATIOS: { name: string; value: number }[] = [
  { name: '4:5', value: 0.8 },
  { name: '1:1', value: 1 },
  { name: '1.91:1', value: 1.91 },
];

const IG_MIN = 0.75;
const IG_MAX = 1.91;
const SOFT_SNAP_TOLERANCE = 0.05;

export interface AutoCropPlan {
  targetRatio: number;
  label: string;
  reason: 'out-of-bounds' | 'soft-snap';
}

export function planAutoCrop(
  width: number,
  height: number,
  options?: { strict?: boolean },
): AutoCropPlan | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const ratio = width / height;

  if (ratio < IG_MIN) return { targetRatio: 0.8, label: '4:5', reason: 'out-of-bounds' };
  if (ratio > IG_MAX) return { targetRatio: 1.91, label: '1.91:1', reason: 'out-of-bounds' };

  if (options?.strict) return null;

  let best: { name: string; value: number } | null = null;
  let bestDelta = SOFT_SNAP_TOLERANCE;
  for (const c of CANONICAL_RATIOS) {
    const delta = Math.abs(c.value - ratio) / c.value;
    if (delta > 0 && delta < bestDelta) {
      bestDelta = delta;
      best = c;
    }
  }
  return best ? { targetRatio: best.value, label: best.name, reason: 'soft-snap' } : null;
}

/**
 * Center-crop rectangle for a target aspect ratio. Trims top/bottom when
 * source is too tall, left/right when too wide. Returns integer pixels.
 */
export function computeCenterCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: number,
): { x: number; y: number; width: number; height: number } {
  const sourceRatio = sourceWidth / sourceHeight;
  if (Math.abs(sourceRatio - targetRatio) < 0.001) {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }
  if (sourceRatio > targetRatio) {
    const newW = Math.round(sourceHeight * targetRatio);
    const x = Math.max(0, Math.floor((sourceWidth - newW) / 2));
    return { x, y: 0, width: Math.min(newW, sourceWidth - x), height: sourceHeight };
  }
  const newH = Math.round(sourceWidth / targetRatio);
  const y = Math.max(0, Math.floor((sourceHeight - newH) / 2));
  return { x: 0, y, width: sourceWidth, height: Math.min(newH, sourceHeight - y) };
}
