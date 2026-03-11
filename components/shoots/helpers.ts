import type { ShootItem } from './types';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getMonthName(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isShootPast(dateStr: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

export function isPast(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/** Get abbreviation — prefer parsed from Monday name, fallback to initials */
export function getAbbr(item: ShootItem): string {
  if (item.abbreviation) return item.abbreviation;
  const words = item.clientName.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
}

export function getEditingBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes('edited') || s.includes('done') || s.includes('complete'))
    return { variant: 'success' as const, label: status };
  if (s.includes('editing') || s.includes('progress'))
    return { variant: 'info' as const, label: status };
  if (s.includes('scheduled'))
    return { variant: 'warning' as const, label: status };
  if (s.includes('not started'))
    return { variant: 'default' as const, label: status };
  return { variant: 'default' as const, label: status || 'No status' };
}

export function getRawsBadge(status: string) {
  const s = status.toLowerCase();
  if (s.includes('uploaded'))
    return { variant: 'success' as const, label: 'RAWs uploaded' };
  if (s.includes('no shoot'))
    return { variant: 'default' as const, label: 'No shoot' };
  return { variant: 'warning' as const, label: status || 'Pending' };
}

// ---------------------------------------------------------------------------
// Client-side cache for content calendar data
// ---------------------------------------------------------------------------

const CLIENT_CACHE_KEY = 'shoots_content_calendar';
const CLIENT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getClientCache(): { groups: unknown; items: unknown } | null {
  try {
    const raw = sessionStorage.getItem(CLIENT_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CLIENT_CACHE_TTL) {
      sessionStorage.removeItem(CLIENT_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setClientCache(data: { groups: unknown; items: unknown }) {
  try {
    sessionStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage full or unavailable
  }
}

export function clearClientCache() {
  try {
    sessionStorage.removeItem(CLIENT_CACHE_KEY);
  } catch {
    // ignore
  }
}
