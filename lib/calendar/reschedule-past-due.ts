/**
 * Reschedules past-due `draft` posts that are about to be approved.
 *
 * Why this exists: when a client takes a few days to approve a content drop,
 * some posts in the batch may already be in the past (scheduled for May 1, but
 * the client approved on May 5). Without intervention, `publishScheduledPost`
 * hands those past-due timestamps to Zernio, which then either publishes
 * everything immediately (a spam burst) or rejects with a "scheduledFor must
 * be in the future" error.
 *
 * Strategy (Jack-confirmed 2026-05-07):
 *   - Find open days in the *current calendar month* only (no bleeding into
 *     next month).
 *   - Place earliest past-due posts into earliest available days first.
 *   - Prefer truly empty days; fall back to the lightest-loaded days.
 *   - Preserve the original time-of-day (UTC) on each shifted post.
 *   - Surface overflow (posts that didn't fit in the month) to Jack via the
 *     client's Google Chat webhook, never the client.
 *
 * Only operates on `draft` rows. Posts already in `scheduled` / `publishing` /
 * `published` are left alone (they've already been handed to Zernio).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PastDueMove {
  postId: string;
  clientId: string;
  oldScheduledAt: string;
  newScheduledAt: string;
  /** True when we had to place this post on a day that already had at least one post. */
  doubledUp: boolean;
}

export interface PastDueResult {
  moves: PastDueMove[];
  /** Post ids that couldn't be rescheduled this month (month fully past or no candidate days). */
  overflow: string[];
}

interface PostRow {
  id: string;
  client_id: string;
  scheduled_at: string;
  status: string;
}

/**
 * Returns YYYY-MM-DD for a Date in UTC.
 */
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Last instant of the current calendar month in UTC.
 */
function endOfCurrentUtcMonth(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return new Date(next.getTime() - 1);
}

/**
 * Build a sorted list of YYYY-MM-DD candidate days from today (inclusive) through the
 * last day of the current month.
 */
function candidateDaysThisMonth(now: Date): string[] {
  const days: string[] = [];
  const last = endOfCurrentUtcMonth(now);
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (cursor <= last) {
    days.push(utcDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * Returns true if combining `dayKey` with the time-of-day from `originalIso`
 * would land in the future (with a 60s buffer). Used to filter candidate days
 * so the picker honors occupancy on the day it actually places.
 */
function dayHasFutureSlot(dayKey: string, originalIso: string, now: Date): boolean {
  const timeSuffix = originalIso.slice(11);
  const candidate = `${dayKey}T${timeSuffix}`;
  return new Date(candidate).getTime() > now.getTime() + 60_000;
}

/**
 * For a given client, returns a Map<YYYY-MM-DD, count> of how many posts the
 * client already has scheduled in the rest of the current month. Used to
 * pick the lightest-loaded day for past-due placements.
 *
 * `excludePostIds` lets us ignore the past-due rows themselves (we're about
 * to move them) so they don't double-count against their own gap search.
 */
async function buildOccupancyMap(
  admin: SupabaseClient,
  clientId: string,
  candidateDays: string[],
  excludePostIds: string[],
): Promise<Map<string, number>> {
  const occupancy = new Map<string, number>();
  if (candidateDays.length === 0) return occupancy;

  const startIso = `${candidateDays[0]}T00:00:00.000Z`;
  const endIso = `${candidateDays[candidateDays.length - 1]}T23:59:59.999Z`;

  let q = admin
    .from('scheduled_posts')
    .select('id, scheduled_at, status')
    .eq('client_id', clientId)
    .gte('scheduled_at', startIso)
    .lte('scheduled_at', endIso)
    // 'cancelled' / 'failed' don't occupy a slot. Everything else (draft,
    // scheduled, publishing, published, partial) does.
    .not('status', 'in', '(cancelled,failed)');

  if (excludePostIds.length > 0) {
    q = q.not('id', 'in', `(${excludePostIds.join(',')})`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[reschedule-past-due] occupancy query failed:', error);
    return occupancy;
  }

  for (const row of (data ?? []) as { scheduled_at: string }[]) {
    const day = row.scheduled_at.slice(0, 10);
    occupancy.set(day, (occupancy.get(day) ?? 0) + 1);
  }
  return occupancy;
}

/**
 * Reschedule any past-due drafts among `postIds` to gaps in the current
 * calendar month. Returns the set of moves performed plus any posts that
 * couldn't fit (overflow). Idempotent: safe to call multiple times.
 *
 * Does NOT touch Zernio. These are still drafts, no `late_post_id` exists
 * yet. The next call to `publishScheduledPost` will use the updated
 * `scheduled_at` when it hands off to Zernio.
 */
export async function reschedulePastDueDrafts(
  admin: SupabaseClient,
  postIds: string[],
): Promise<PastDueResult> {
  if (postIds.length === 0) return { moves: [], overflow: [] };

  const { data: posts, error } = await admin
    .from('scheduled_posts')
    .select('id, client_id, scheduled_at, status')
    .in('id', postIds);
  if (error || !posts) {
    console.error('[reschedule-past-due] post lookup failed:', error);
    return { moves: [], overflow: [] };
  }

  const now = new Date();
  // Buffer: anything within the next 5 minutes is functionally past-due. By
  // the time we update DB and call publishScheduledPost, it would fire.
  const cutoffMs = now.getTime() + 5 * 60 * 1000;
  const pastDue = (posts as PostRow[]).filter(
    (p) => p.status === 'draft' && new Date(p.scheduled_at).getTime() < cutoffMs,
  );
  if (pastDue.length === 0) return { moves: [], overflow: [] };

  // Group by client so each client's gap search uses only its own occupancy.
  const byClient = new Map<string, PostRow[]>();
  for (const p of pastDue) {
    const arr = byClient.get(p.client_id) ?? [];
    arr.push(p);
    byClient.set(p.client_id, arr);
  }

  const candidateDays = candidateDaysThisMonth(now);

  const moves: PastDueMove[] = [];
  const overflow: string[] = [];

  for (const [clientId, clientPosts] of byClient) {
    const occupancy = await buildOccupancyMap(
      admin,
      clientId,
      candidateDays,
      clientPosts.map((p) => p.id),
    );

    // Process earliest-originally-scheduled first so the oldest past-due posts
    // get the earliest open slots, preserves intended ordering.
    const sorted = [...clientPosts].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

    for (const post of sorted) {
      // Only consider days where the post's time-of-day still lies in the
      // future, otherwise we'd pick a day with count=0, then silently shove
      // the post onto the next day and double up with another past-due move.
      const eligibleDays = candidateDays.filter((d) =>
        dayHasFutureSlot(d, post.scheduled_at, now),
      );

      // Pick the lightest-loaded eligible day. Tie-break by earliest. Empty wins.
      let bestDay: string | null = null;
      let bestCount = Infinity;
      for (const day of eligibleDays) {
        const c = occupancy.get(day) ?? 0;
        if (c < bestCount) {
          bestCount = c;
          bestDay = day;
          if (c === 0) break;
        }
      }

      if (!bestDay) {
        overflow.push(post.id);
        continue;
      }

      const newIso = `${bestDay}T${post.scheduled_at.slice(11)}`;

      const { error: updateErr } = await admin
        .from('scheduled_posts')
        .update({ scheduled_at: newIso, updated_at: new Date().toISOString() })
        .eq('id', post.id);
      if (updateErr) {
        console.error(`[reschedule-past-due] update failed for ${post.id}:`, updateErr);
        overflow.push(post.id);
        continue;
      }

      moves.push({
        postId: post.id,
        clientId,
        oldScheduledAt: post.scheduled_at,
        newScheduledAt: newIso,
        doubledUp: bestCount > 0,
      });

      // Bump the chosen day so the next past-due post in this client doesn't
      // pile onto the same slot.
      occupancy.set(bestDay, (occupancy.get(bestDay) ?? 0) + 1);
    }
  }

  return { moves, overflow };
}
