// Shared preset → DateRange resolver. Used by the DateRangePicker UI,
// the reporting data hook, and the affiliates hook so they can't drift.
// All dates are local; callers pass the resulting YYYY-MM-DD strings
// straight to API routes that interpret them in the client's own timezone.

import type { DateRangePreset, DateRange } from '@/lib/types/reporting';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function resolvePresetRange(
  preset: DateRangePreset,
  customRange?: DateRange,
): DateRange {
  const today = new Date();
  const end = toDateStr(today);

  const daysAgo = (n: number): DateRange => {
    const start = new Date(today);
    start.setDate(start.getDate() - n);
    return { start: toDateStr(start), end };
  };

  switch (preset) {
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      const s = toDateStr(y);
      return { start: s, end: s };
    }
    case 'last_7d':
    case '7d':
      return daysAgo(7);
    case 'last_28d':
      return daysAgo(28);
    case 'last_30d':
    case '30d':
      return daysAgo(30);
    case 'last_90d':
    case 'last_quarter':
      // Meta's "Last 90 days" is a rolling 90-day window, not the
      // previous calendar quarter. Legacy `last_quarter` callers fall
      // through to the same behaviour for consistency.
      return daysAgo(90);
    case 'this_week': {
      // Week starts Sunday to match the Meta screenshot's calendar grid.
      const dow = today.getDay();
      const start = new Date(today); start.setDate(start.getDate() - dow);
      return { start: toDateStr(start), end };
    }
    case 'last_week': {
      const dow = today.getDay();
      const thisWeekStart = new Date(today); thisWeekStart.setDate(thisWeekStart.getDate() - dow);
      const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      const lastWeekStart = new Date(lastWeekEnd); lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      return { start: toDateStr(lastWeekStart), end: toDateStr(lastWeekEnd) };
    }
    case 'this_month':
    case 'mtd': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toDateStr(start), end };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: toDateStr(start), end: toDateStr(lastDay) };
    }
    case 'this_year':
    case 'ytd': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start: toDateStr(start), end };
    }
    case 'custom':
      if (customRange) return customRange;
      return daysAgo(28);
    default:
      return daysAgo(28);
  }
}

export function presetLabel(preset: DateRangePreset): string {
  switch (preset) {
    case 'yesterday':    return 'Yesterday';
    case 'last_7d':
    case '7d':           return 'Last 7 days';
    case 'last_28d':     return 'Last 28 days';
    case 'last_30d':
    case '30d':          return 'Last 30 days';
    case 'last_90d':
    case 'last_quarter': return 'Last 90 days';
    case 'this_week':    return 'This week';
    case 'last_week':    return 'Last week';
    case 'this_month':
    case 'mtd':          return 'This month';
    case 'last_month':   return 'Last month';
    case 'this_year':
    case 'ytd':          return 'This year';
    case 'custom':       return 'Custom';
    default:             return 'Custom';
  }
}
