/**
 * Helpers for the content_month column (migration 322).
 *
 * `content_month` is always stored as a `date` typed to the 1st of the
 * month. These helpers normalise input (any ISO string -> first-of-
 * month), produce display labels, and build sort keys for the list
 * grouping.
 */

import type { EditingProject } from '@/lib/editing/types';

const MONTH_LONG = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });

/**
 * Normalise any ISO string or `Date` to a first-of-month `YYYY-MM-01`
 * string in the *user's local* timezone. We deliberately don't use UTC
 * — Jack creates the May calendar in May Eastern time and "content_month"
 * should reflect that, not slip a day backwards into April.
 */
export function toFirstOfMonth(input: string | Date | null | undefined): string | null {
  if (!input) return null;
  const d = typeof input === 'string' ? new Date(input) : input;
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

export function currentMonth(): string {
  return toFirstOfMonth(new Date()) as string;
}

/**
 * Adjacent month relative to a `YYYY-MM-DD` string. Returns
 * `YYYY-MM-01`. `direction` = -1 for previous, +1 for next.
 */
export function adjacentMonth(month: string, direction: -1 | 1): string {
  const [yStr, mStr] = month.split('-');
  let y = Number(yStr);
  let m = Number(mStr) + direction;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export function formatMonthLong(month: string | null | undefined): string {
  if (!month) return 'Unscheduled';
  const [y, m] = month.split('-').map(Number);
  return MONTH_LONG.format(new Date(y, (m ?? 1) - 1, 1));
}

export function formatMonthShort(month: string | null | undefined): string {
  if (!month) return '-';
  const [y, m] = month.split('-').map(Number);
  return MONTH_SHORT.format(new Date(y, (m ?? 1) - 1, 1));
}

/**
 * Group a project list by content_month. Returns an array of
 * `{ month, label, projects }` sorted newest-first, with `month: null`
 * (unscheduled bucket) pushed to the end.
 */
export interface ContentMonthGroup<T extends Pick<EditingProject, 'content_month'>> {
  month: string | null;
  label: string;
  projects: T[];
}

export function groupByContentMonth<T extends Pick<EditingProject, 'content_month'>>(
  projects: T[],
): ContentMonthGroup<T>[] {
  const buckets = new Map<string | null, T[]>();
  for (const p of projects) {
    const key = p.content_month ?? null;
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }
  const groups: ContentMonthGroup<T>[] = Array.from(buckets.entries()).map(([month, list]) => ({
    month,
    label: formatMonthLong(month),
    projects: list,
  }));
  groups.sort((a, b) => {
    if (a.month === null) return 1;
    if (b.month === null) return -1;
    return a.month < b.month ? 1 : -1;
  });
  return groups;
}

/**
 * Build the month-picker options: from `min` to `max` inclusive, plus
 * "Unscheduled" sentinel. Defaults to a 12-month rolling window
 * centered on the current month.
 */
export function monthPickerOptions(opts?: {
  min?: string;
  max?: string;
}): Array<{ value: string | null; label: string }> {
  const now = currentMonth();
  const min = opts?.min ?? adjacentMonth(adjacentMonth(adjacentMonth(adjacentMonth(adjacentMonth(adjacentMonth(now, -1), -1), -1), -1), -1), -1);
  const max = opts?.max ?? adjacentMonth(adjacentMonth(adjacentMonth(adjacentMonth(adjacentMonth(adjacentMonth(now, 1), 1), 1), 1), 1), 1);
  const out: Array<{ value: string | null; label: string }> = [];
  let cursor = max;
  // Walk newest -> oldest so the most recent options are at the top.
  while (cursor >= min) {
    out.push({ value: cursor, label: formatMonthLong(cursor) });
    cursor = adjacentMonth(cursor, -1);
  }
  out.push({ value: null, label: 'Unscheduled' });
  return out;
}
