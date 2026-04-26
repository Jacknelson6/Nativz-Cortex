/**
 * Overlap-free slot computation.
 *
 * Inputs:
 *   - per-member busy ranges (from `fetchBusyForUser`)
 *   - working-hours window (e.g. 09:00–17:00) interpreted in `timezone`
 *   - duration in minutes, lookahead in days, slot stride
 *
 * Strategy:
 *   1. For each day in [today, today + lookaheadDays):
 *      Compute the day's working window as a UTC range using the event's
 *      timezone (so 09:00 NY local DST-aware → correct UTC instant).
 *   2. Merge all members' busy ranges into a flat sorted list of
 *      [start,end) UTC intervals.
 *   3. Subtract the merged busy from each day's working window → free intervals.
 *   4. Within each free interval, slice into `durationMinutes` slots, stepping
 *      by `slotStrideMinutes`. A slot is included only if it fits entirely
 *      inside the free interval.
 *
 * "Optional" attendees are handled at the call site — the caller decides
 * whether to subtract their busy or just track them per-slot for an "X of Y
 * available" indicator. This module only computes the strict overlap.
 */

export interface Interval {
  start: Date;
  end: Date;
}

/** UTC milliseconds for a wall-clock date in `timezone`, DST-aware.
 *  Iterates 2× because the offset itself depends on the resolved instant. */
function wallClockToUtcMs(
  year: number,
  month: number, // 1–12
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): number {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = dtf.formatToParts(new Date(guess));
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
    );
    const offset = asUtc - guess;
    guess = Date.UTC(year, month - 1, day, hour, minute) - offset;
  }
  return guess;
}

/** Read year/month/day for a UTC instant as displayed in `timezone`. */
function tzCalendarParts(date: Date, timezone: string): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/** Merge overlapping/adjacent intervals into a sorted, disjoint list. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/** Subtract `busy` (assumed merged + sorted) from `window`. Returns 0..N free intervals. */
function subtractBusy(window: Interval, busy: Interval[]): Interval[] {
  const result: Interval[] = [];
  let cursor = window.start.getTime();
  const end = window.end.getTime();

  for (const b of busy) {
    const bStart = b.start.getTime();
    const bEnd = b.end.getTime();
    if (bEnd <= cursor) continue;
    if (bStart >= end) break;
    if (bStart > cursor) {
      result.push({ start: new Date(cursor), end: new Date(Math.min(bStart, end)) });
    }
    cursor = Math.max(cursor, bEnd);
    if (cursor >= end) break;
  }
  if (cursor < end) result.push({ start: new Date(cursor), end: new Date(end) });
  return result;
}

export interface FreeSlot {
  start: Date;
  end: Date;
}

export interface ComputeFreeSlotsInput {
  /** Each member's busy ranges (UTC). Required members only — optional members are
   *  handled by the caller (they don't block slots). */
  busyByUser: Interval[][];
  /** Slot duration in minutes (15–240 enforced by DB; this fn doesn't re-validate). */
  durationMinutes: number;
  /** Days from `now` to scan. */
  lookaheadDays: number;
  /** Local working window — applies per day in `timezone`. */
  workingStart: string; // 'HH:MM'
  workingEnd: string; // 'HH:MM'
  timezone: string; // 'America/New_York'
  /** Stride between candidate slots, default = duration. */
  slotStrideMinutes?: number;
  /** Reference instant; defaults to now. Used to skip past slots. */
  now?: Date;
  /** Skip slots that start within this many minutes from `now`. Default 60. */
  minLeadMinutes?: number;
  /** Cap returned slots — UI shouldn't render thousands. Default 200. */
  maxSlots?: number;
}

/**
 * Returns slot start times that all required members are free for, sorted ascending.
 * Each returned slot has length === `durationMinutes` and falls strictly within a
 * day's working window in `timezone`.
 */
export function computeFreeSlots(input: ComputeFreeSlotsInput): FreeSlot[] {
  const {
    busyByUser,
    durationMinutes,
    lookaheadDays,
    workingStart,
    workingEnd,
    timezone,
    slotStrideMinutes = durationMinutes,
    now = new Date(),
    minLeadMinutes = 60,
    maxSlots = 200,
  } = input;

  const [startH, startM] = workingStart.split(':').map(Number);
  const [endH, endM] = workingEnd.split(':').map(Number);
  if (Number.isNaN(startH) || Number.isNaN(endH)) return [];

  // Union all members' busy windows into one merged list.
  const allBusy: Interval[] = ([] as Interval[]).concat(...busyByUser);
  const mergedBusy = mergeIntervals(allBusy);

  const earliest = now.getTime() + minLeadMinutes * 60_000;
  const slots: FreeSlot[] = [];

  // Walk days in the EVENT's timezone so DST shifts produce correct windows.
  const todayParts = tzCalendarParts(now, timezone);
  for (let dayOffset = 0; dayOffset < lookaheadDays; dayOffset++) {
    // Step day in the tz by adding 24h to a noon anchor (avoids DST landmines).
    const noonAnchorUtc = wallClockToUtcMs(
      todayParts.year,
      todayParts.month,
      todayParts.day + dayOffset,
      12,
      0,
      timezone,
    );
    const parts = tzCalendarParts(new Date(noonAnchorUtc), timezone);
    const dayStartUtc = wallClockToUtcMs(parts.year, parts.month, parts.day, startH, startM ?? 0, timezone);
    const dayEndUtc = wallClockToUtcMs(parts.year, parts.month, parts.day, endH, endM ?? 0, timezone);
    if (dayEndUtc <= dayStartUtc) continue;
    if (dayEndUtc <= earliest) continue;

    const window: Interval = {
      start: new Date(Math.max(dayStartUtc, earliest)),
      end: new Date(dayEndUtc),
    };

    const free = subtractBusy(window, mergedBusy);
    for (const f of free) {
      const startMs = f.start.getTime();
      const endMs = f.end.getTime();
      const durMs = durationMinutes * 60_000;
      const strideMs = slotStrideMinutes * 60_000;

      // Snap first candidate up to next stride boundary inside the free interval —
      // keeps slots clean (e.g. :00 and :30 instead of :07 and :37).
      const dayStartMs = dayStartUtc;
      let candidate = startMs;
      const offset = (startMs - dayStartMs) % strideMs;
      if (offset !== 0) candidate = startMs + (strideMs - offset);

      while (candidate + durMs <= endMs) {
        slots.push({ start: new Date(candidate), end: new Date(candidate + durMs) });
        if (slots.length >= maxSlots) return slots;
        candidate += strideMs;
      }
    }
  }
  return slots;
}

/**
 * Group slots by local-tz day for UI display.
 * Returns: [ { dayIso: '2026-04-28', slots: [...] }, ... ] ordered ascending.
 */
export function groupSlotsByDay(
  slots: FreeSlot[],
  timezone: string,
): { dayIso: string; slots: FreeSlot[] }[] {
  const groups = new Map<string, FreeSlot[]>();
  for (const slot of slots) {
    const parts = tzCalendarParts(slot.start, timezone);
    const dayIso = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    let bucket = groups.get(dayIso);
    if (!bucket) {
      bucket = [];
      groups.set(dayIso, bucket);
    }
    bucket.push(slot);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayIso, slots]) => ({ dayIso, slots }));
}
