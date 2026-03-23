import type { OnScreenText } from './types';

/**
 * When the global "offer" line repeats the subheadline/headline theme, omit it from the image
 * and from QA — avoids duplicate taglines (e.g. RankPrompt offer vs subhead).
 */
export function resolveOfferForAdImage(
  offer: string | null | undefined,
  onScreenText: OnScreenText,
): string | null {
  if (!offer?.trim()) return null;
  const o = offer.trim();
  if (isOfferRedundantWithOnScreenText(o, onScreenText)) return null;
  return o;
}

function tokenizeForOverlap(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
}

function isOfferRedundantWithOnScreenText(offer: string, onScreenText: OnScreenText): boolean {
  const oNorm = offer.trim().toLowerCase();
  const sub = onScreenText.subheadline.trim().toLowerCase();
  const head = onScreenText.headline.trim().toLowerCase();
  if (!oNorm) return false;
  if (sub.includes(oNorm) || head.includes(oNorm)) return true;

  const offerWords = tokenizeForOverlap(offer);
  if (offerWords.length === 0) return false;
  const combined = `${head} ${sub}`;
  let hits = 0;
  for (const w of offerWords) {
    if (combined.includes(w)) hits++;
  }
  return hits / offerWords.length >= 0.55;
}
