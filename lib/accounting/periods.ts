/**
 * Bi-monthly pay period math. Pay runs are 1st→15th and 16th→last-day-of-month.
 * All dates are treated as local ISO date strings (YYYY-MM-DD) — no timezone math.
 */

export type PayrollHalf = 'first-half' | 'second-half';

export interface PeriodBounds {
  startDate: string;
  endDate: string;
  half: PayrollHalf;
  label: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function isoDate(year: number, month1Based: number, day: number): string {
  return `${year}-${pad(month1Based)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

function monthLabel(year: number, month1Based: number): string {
  return new Date(year, month1Based - 1, 1).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export function periodFor(date: Date): PeriodBounds {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (day <= 15) {
    return {
      startDate: isoDate(year, month, 1),
      endDate: isoDate(year, month, 15),
      half: 'first-half',
      label: `${monthLabel(year, month)} · 1–15`,
    };
  }
  const last = lastDayOfMonth(year, month);
  return {
    startDate: isoDate(year, month, 16),
    endDate: isoDate(year, month, last),
    half: 'second-half',
    label: `${monthLabel(year, month)} · 16–${last}`,
  };
}

export function currentPeriod(): PeriodBounds {
  return periodFor(new Date());
}

export function nextPeriod(after: PeriodBounds = currentPeriod()): PeriodBounds {
  const [y, m] = after.startDate.split('-').map(Number);
  if (after.half === 'first-half') {
    const last = lastDayOfMonth(y, m);
    return {
      startDate: isoDate(y, m, 16),
      endDate: isoDate(y, m, last),
      half: 'second-half',
      label: `${monthLabel(y, m)} · 16–${last}`,
    };
  }
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return {
    startDate: isoDate(nextYear, nextMonth, 1),
    endDate: isoDate(nextYear, nextMonth, 15),
    half: 'first-half',
    label: `${monthLabel(nextYear, nextMonth)} · 1–15`,
  };
}

export function labelFor(startDate: string, half: PayrollHalf): string {
  const [y, m] = startDate.split('-').map(Number);
  if (half === 'first-half') return `${monthLabel(y, m)} · 1–15`;
  const last = lastDayOfMonth(y, m);
  return `${monthLabel(y, m)} · 16–${last}`;
}

export function dollarsToCents(input: string | number): number {
  const n = typeof input === 'number' ? input : parseFloat(input);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}
