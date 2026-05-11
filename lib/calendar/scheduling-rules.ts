/**
 * Scheduling invariants for the content calendar.
 *
 * Rooted in the 2026-05-11 missing-platforms backfill: when we re-fanned
 * the prior 60 days into the silent platforms, several clients had a
 * normal scheduled post AND a backfill clone landing on the same day on
 * the same platform. Jack's rule (2026-05-11): every (client, platform)
 * gets at most one scheduled post per Central-time day, unless the
 * caller passes `allowSameDay: true` to explicitly opt out.
 *
 * Legitimate opt-out cases:
 *   - `app/api/scheduler/posts/add-platforms` cloned mode (splits a
 *     past-due post into a fresh clone targeting one platform)
 *   - `app/api/scheduler/posts/batch-publish` (flips status to
 *     `publishing`, scheduled_at moves to now() so a real publish runs)
 *   - holiday bursts / promotional double-drops the team explicitly
 *     approves at the call site
 *
 * The check counts only live-pipeline posts (`draft`, `scheduled`,
 * `publishing`, `partially_failed`); terminal states (`published`,
 * `failed`, `cancelled`) don't block future scheduling.
 *
 * Day boundary is America/Chicago (Central time). Cortex is a US-Central
 * agency, the calendar UI renders slots in Chicago wall-clock, and the
 * team thinks in "Tuesday's post" not "Tuesday-UTC's post" — so the
 * collision boundary needs to match what people see, even if the DB
 * stores UTC. Handles CST/CDT automatically via Intl (no hardcoded
 * offset), matching the convention in `lib/calendar/distribute-slots.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialPlatform } from '@/lib/posting/types';

/** Statuses that count as "occupying" the slot for collision detection. */
const LIVE_STATUSES = ['draft', 'scheduled', 'publishing', 'partially_failed'] as const;

export interface CollisionCheckInput {
  clientId: string;
  /** Platforms the post will publish to. Empty array => no check (no-op). */
  platforms: SocialPlatform[];
  /** ISO timestamp of when the post is scheduled. */
  scheduledAt: string;
  /** When rescheduling an existing post, exclude it from the search. */
  excludePostId?: string;
}

export interface PlatformCollision {
  platform: SocialPlatform;
  conflictingPostId: string;
  conflictingScheduledAt: string;
  conflictingStatus: string;
}

export class SameDayScheduleError extends Error {
  collisions: PlatformCollision[];
  constructor(collisions: PlatformCollision[]) {
    const summary = collisions
      .map((c) => `${c.platform} (already at ${c.conflictingScheduledAt})`)
      .join(', ');
    super(
      `Same-day scheduling conflict: this client already has a scheduled post on ${summary}. ` +
        `Pass allowSameDay: true to override.`,
    );
    this.name = 'SameDayScheduleError';
    this.collisions = collisions;
  }
}

const CHICAGO_TZ = 'America/Chicago';

/**
 * Extract the Central-time wall-clock Y/M/D for a given UTC instant.
 * Uses Intl.DateTimeFormat so CST/CDT is handled automatically.
 */
function centralDateParts(iso: string): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const pick = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/**
 * Convert a Central-time wall-clock moment (y/m/d/h/min/s/ms) to the
 * corresponding UTC ISO string. Uses the round-trip trick: tentatively
 * treat the inputs as UTC, observe what Chicago wall-clock that lands at,
 * and shift by the delta. Handles CST/CDT without hardcoded offsets.
 */
function centralToUtcIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): string {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(guess));
  const pick = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value);
  const observed = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour') % 24,
    pick('minute'),
    pick('second'),
    ms,
  );
  return new Date(guess + (guess - observed)).toISOString();
}

function centralDayBounds(iso: string): { lo: string; hi: string } {
  const { year, month, day } = centralDateParts(iso);
  return {
    lo: centralToUtcIso(year, month, day, 0, 0, 0, 0),
    hi: centralToUtcIso(year, month, day, 23, 59, 59, 999),
  };
}

/**
 * Return any (client, platform, Central-day) collisions that scheduling the
 * given post would create. Empty array means scheduling is clear.
 *
 * Use this when you want to inspect collisions and decide what to do
 * (e.g. nudge to the next free day). Use `assertNoSameDayCollision`
 * when you want the default "reject" behavior.
 */
export async function findSameDayCollisions(
  supabase: SupabaseClient,
  input: CollisionCheckInput,
): Promise<PlatformCollision[]> {
  if (input.platforms.length === 0) return [];

  const { lo, hi } = centralDayBounds(input.scheduledAt);

  // Pull all live-pipeline posts for this client on the target day, with
  // their platform legs hydrated via social_profiles. Then filter to the
  // platforms we care about.
  let query = supabase
    .from('scheduled_posts')
    .select(
      'id, scheduled_at, status, scheduled_post_platforms(social_profile_id, social_profiles(platform))',
    )
    .eq('client_id', input.clientId)
    .gte('scheduled_at', lo)
    .lte('scheduled_at', hi)
    .in('status', LIVE_STATUSES as unknown as string[]);
  if (input.excludePostId) query = query.neq('id', input.excludePostId);

  const { data, error } = await query;
  if (error) {
    // Fail-open: if the collision check itself errors, log and let the
    // schedule proceed — it's better than blocking legitimate writes on
    // a transient DB hiccup. The watch cron will catch any miss next day.
    console.error('[scheduling-rules] collision check failed:', error.message);
    return [];
  }

  // Supabase typegen models embedded joins as an array even when the FK
  // is to a single row, so `social_profiles` here is typed as
  // `{ platform: ... }[]` — in practice it's length 0 or 1. Normalize both
  // shapes so future typegen changes (single-object) keep working.
  type RawRow = {
    id: string;
    scheduled_at: string;
    status: string;
    scheduled_post_platforms: Array<{
      social_profiles:
        | { platform: SocialPlatform }
        | Array<{ platform: SocialPlatform }>
        | null;
    }>;
  };

  const wanted = new Set(input.platforms);
  const collisions: PlatformCollision[] = [];
  const seenPlatforms = new Set<SocialPlatform>();
  for (const row of (data ?? []) as unknown as RawRow[]) {
    for (const spp of row.scheduled_post_platforms ?? []) {
      const sp = spp.social_profiles;
      const platform = Array.isArray(sp) ? sp[0]?.platform : sp?.platform;
      if (!platform || !wanted.has(platform) || seenPlatforms.has(platform)) continue;
      seenPlatforms.add(platform);
      collisions.push({
        platform,
        conflictingPostId: row.id,
        conflictingScheduledAt: row.scheduled_at,
        conflictingStatus: row.status,
      });
    }
  }
  return collisions;
}

/**
 * Throw `SameDayScheduleError` if any platform in `input.platforms` would
 * collide with an existing scheduled post for the same client on the
 * same Central-time day. Pass `allowSameDay: true` to skip the check entirely
 * (the documented escape hatch for cloned posts, batch-publish, and
 * explicit holiday-burst overrides).
 */
export async function assertNoSameDayCollision(
  supabase: SupabaseClient,
  input: CollisionCheckInput & { allowSameDay?: boolean },
): Promise<void> {
  if (input.allowSameDay) return;
  const collisions = await findSameDayCollisions(supabase, input);
  if (collisions.length > 0) throw new SameDayScheduleError(collisions);
}

/**
 * Read Central wall-clock h/m/s for an instant so day-stepping can preserve
 * the original time-of-day (a 10am Central slot stays 10am Central after
 * shifting, not 9am the day a DST transition crosses).
 */
function centralTimeOfDay(iso: string): {
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const pick = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value);
  return {
    hour: pick('hour') % 24,
    minute: pick('minute'),
    second: pick('second'),
  };
}

/**
 * Advance `scheduledAt` forward one Central day at a time until no
 * collision exists for the given (client, platforms). Useful for bulk
 * paths (auto-schedule, calendar generation, backfill drips) that want
 * to automatically dodge collisions rather than surface them to the
 * user.
 *
 * Returns the original `scheduledAt` if it was already clear, or the
 * adjusted ISO string. The wall-clock time-of-day in Central is
 * preserved across DST transitions. Caps at `maxDays` lookahead to
 * avoid runaway loops on a deeply over-scheduled brand.
 */
export async function nextFreeSlot(
  supabase: SupabaseClient,
  input: CollisionCheckInput,
  opts: { maxDays?: number } = {},
): Promise<{ scheduledAt: string; movedDays: number }> {
  const maxDays = opts.maxDays ?? 30;
  const tod = centralTimeOfDay(input.scheduledAt);
  let current = input.scheduledAt;
  for (let i = 0; i <= maxDays; i += 1) {
    const collisions = await findSameDayCollisions(supabase, {
      ...input,
      scheduledAt: current,
    });
    if (collisions.length === 0) return { scheduledAt: current, movedDays: i };
    // Step forward to the same Central wall-clock time on the next
    // Central day. Re-deriving the date parts each iteration is what
    // makes DST transitions safe.
    const { year, month, day } = centralDateParts(current);
    current = centralToUtcIso(
      year,
      month,
      day + 1,
      tod.hour,
      tod.minute,
      tod.second,
    );
  }
  // Ran out of lookahead. Return the last attempted slot so the caller
  // can decide whether to error or schedule anyway; the alerter cron
  // will surface the resulting collision the next day.
  return { scheduledAt: current, movedDays: maxDays };
}
