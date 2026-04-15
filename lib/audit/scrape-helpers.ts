import type { ProspectVideo } from './types';

export interface DailyEngagement {
  /** YYYY-MM-DD in UTC. */
  date: string;
  /** Raw post-day engagement (sum of the day's own posts). */
  likes: number;
  comments: number;
  shares: number;
  views: number;
  /** Number of posts published that day. */
  posts: number;
  /** Estimated carryover from recent prior posts — accrues on days with
   *  zero posts so the timeline isn't spiky-flat between posts. Post-day
   *  rows set this to 0 because the raw numbers already cover that day. */
  estimatedCarryover: number;
  /** True when we invented a carryover figure for a no-post day. UI should
   *  render those bars differently (hashed / translucent) so nobody mis-
   *  reads them as hard data. */
  estimated: boolean;
}

export interface ThirtyDayEngagement {
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  totalPosts: number;
  byDay: DailyEngagement[];
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

function toUtcDateKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD from any ISO-8601 string
}

/**
 * Aggregate engagement across a recent window and map it to a per-day
 * timeline. The platform APIs we scrape don't return per-day engagement
 * curves — only the cumulative counts on each post as of scrape time. So
 * post days carry the full numbers (accurate); no-post days are modelled
 * as a linear taper of the prior post's engagement over the days until
 * the next post (estimated, clearly flagged so the UI can distinguish).
 *
 * This gives the 30-day brief a continuous curve without over-claiming
 * precision. Jack's ask: "estimate how much engagement in between days
 * of posting since the posting days will have lots of engagement".
 */
export function aggregateEngagement(
  videos: ProspectVideo[],
  days = 30,
): ThirtyDayEngagement {
  const now = Date.now();
  const windowMs = days * 24 * 60 * 60 * 1000;
  const cutoff = now - windowMs;

  const dated = videos
    .filter((v) => v.publishDate && new Date(v.publishDate).getTime() >= cutoff)
    .sort((a, b) => new Date(a.publishDate!).getTime() - new Date(b.publishDate!).getTime());

  // Seed a map with every day in the window so days with zero posts still
  // get a row — the timeline chart renders a full bar strip instead of a
  // sparse one.
  const dayRows = new Map<string, DailyEngagement>();
  const startDate = new Date(cutoff);
  for (let i = 0; i <= days; i++) {
    const d = new Date(startDate.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    dayRows.set(key, {
      date: key,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      posts: 0,
      estimatedCarryover: 0,
      estimated: false,
    });
  }

  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalViews = 0;

  // Sum each post's engagement into its own day (real numbers).
  for (const v of dated) {
    const key = toUtcDateKey(v.publishDate!);
    const row = dayRows.get(key);
    if (!row) continue;
    row.likes += v.likes ?? 0;
    row.comments += v.comments ?? 0;
    row.shares += v.shares ?? 0;
    row.views += v.views ?? 0;
    row.posts += 1;
    totalLikes += v.likes ?? 0;
    totalComments += v.comments ?? 0;
    totalShares += v.shares ?? 0;
    totalViews += v.views ?? 0;
  }

  // Between-post estimation: for each post, spread HALF of its engagement
  // linearly across the days BETWEEN this post and the next (exclusive on
  // both ends). Half because we don't want to double-count the post day's
  // own big number — the carryover represents residual attention, not the
  // initial burst. Days with zero posts and no prior post in the window
  // stay at 0.
  const sortedKeys = Array.from(dayRows.keys()).sort();
  for (let i = 0; i < dated.length; i++) {
    const v = dated[i];
    const thisDayKey = toUtcDateKey(v.publishDate!);
    const next = dated[i + 1];
    const nextDayKey = next ? toUtcDateKey(next.publishDate!) : null;

    const startIdx = sortedKeys.indexOf(thisDayKey) + 1;
    const endIdx = nextDayKey
      ? sortedKeys.indexOf(nextDayKey)
      : sortedKeys.length; // spread to the end of the window when this is the latest post
    const gapLen = endIdx - startIdx;
    if (gapLen <= 0) continue;

    const estLikes = (v.likes ?? 0) / 2 / gapLen;
    const estViews = (v.views ?? 0) / 2 / gapLen;
    const estComments = (v.comments ?? 0) / 2 / gapLen;
    const estShares = (v.shares ?? 0) / 2 / gapLen;

    for (let j = startIdx; j < endIdx; j++) {
      const row = dayRows.get(sortedKeys[j]);
      if (!row || row.posts > 0) continue; // don't overwrite real post-day data
      row.likes += Math.round(estLikes);
      row.views += Math.round(estViews);
      row.comments += Math.round(estComments);
      row.shares += Math.round(estShares);
      row.estimatedCarryover = Math.round(estLikes + estComments + estShares);
      row.estimated = true;
    }
  }

  return {
    totalLikes,
    totalComments,
    totalShares,
    totalViews,
    totalPosts: dated.length,
    byDay: Array.from(dayRows.values()),
  };
}

/**
 * Merge platform-supplied bio-link fields with URLs we can extract from the
 * raw bio text and return a clean, de-duplicated list. Every scraper calls
 * this so the `bioLinks` shape is consistent — prospects + competitors on
 * every platform get the same type guarantees.
 */

/**
 * Merge platform-supplied bio-link fields with URLs we can extract from the
 * raw bio text and return a clean, de-duplicated list. Every scraper calls
 * this so the `bioLinks` shape is consistent — prospects + competitors on
 * every platform get the same type guarantees.
 */
export function collectBioLinks(
  bio: string | null | undefined,
  platformLinks: (string | null | undefined)[] = [],
): string[] {
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    if (!raw || typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Strip trailing punctuation commonly attached when URLs are inlined in
    // captions/bios ("…more at https://shop.com.").
    const cleaned = trimmed.replace(/[.,;:)\]}'"»›]+$/, '');
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
  };

  for (const link of platformLinks) push(link);
  if (bio) {
    const matches = bio.match(URL_RE) ?? [];
    for (const m of matches) push(m);
  }
  return Array.from(seen).map((k) => k);
}

/**
 * Keep only videos from the last `days` days. Preserves ordering. Videos
 * without a publish date stay in the result (they might be pinned content
 * or scraper drift) — callers who want a strict window can filter again.
 */
export function filterLastNDays(videos: ProspectVideo[], days = 30): ProspectVideo[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return videos.filter((v) => {
    if (!v.publishDate) return true;
    const t = new Date(v.publishDate).getTime();
    if (Number.isNaN(t)) return true;
    return t >= cutoff;
  });
}
