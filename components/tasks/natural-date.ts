/**
 * Natural language date parser — Todoist-style.
 * Parses inputs like "today", "tomorrow", "next friday", "march 15", "in 3 days",
 * "end of month", "mid january", "3rd friday jan", "+5 days", "27th", etc.
 * Returns YYYY-MM-DD string or null if unparseable.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function getNextWeekday(day: number, from?: Date): Date {
  const base = from ?? getToday();
  const diff = (day - base.getDay() + 7) % 7 || 7;
  return addDays(base, diff);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function isFuture(d: Date, today: Date): boolean {
  return d >= today;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_ABBREVS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_ABBREVS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseDayName(s: string): number {
  let idx = DAY_NAMES.indexOf(s);
  if (idx !== -1) return idx;
  idx = DAY_ABBREVS.indexOf(s);
  return idx;
}

function parseMonthName(s: string): number {
  let idx = MONTH_NAMES.indexOf(s);
  if (idx !== -1) return idx;
  idx = MONTH_ABBREVS.indexOf(s);
  return idx;
}

function parseOrdinal(s: string): number | null {
  const m = s.match(/^(\d+)(?:st|nd|rd|th)?$/);
  return m ? parseInt(m[1]) : null;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date | null {
  const first = new Date(year, month, 1);
  const dayOfFirst = first.getDay();
  const firstOccurrence = 1 + ((weekday - dayOfFirst + 7) % 7);
  const day = firstOccurrence + (nth - 1) * 7;
  if (day > new Date(year, month + 1, 0).getDate()) return null;
  return new Date(year, month, day);
}

// ─── Main Parser ──────────────────────────────────────────────────────────

export function parseNaturalDate(input: string): string | null {
  const text = input.trim().toLowerCase().replace(/,/g, '');
  if (!text) return null;

  const today = getToday();

  // ── Exact keyword matches ───────────────────────────────────────────

  if (text === 'today' || text === 'tod') return toDateStr(today);
  if (text === 'tomorrow' || text === 'tom') return toDateStr(addDays(today, 1));
  if (text === 'yesterday') return toDateStr(addDays(today, -1));

  // "no date" / "no due date" → clear
  if (text === 'no date' || text === 'no due date') return '';

  // "next week" → next Monday
  if (text === 'next week') {
    return toDateStr(getNextWeekday(1));
  }

  // "next month" → same date, one month later
  if (text === 'next month') {
    return toDateStr(addMonths(today, 1));
  }

  // "next year" → Jan 1 of next year
  if (text === 'next year') {
    return toDateStr(new Date(today.getFullYear() + 1, 0, 1));
  }

  // "this weekend" → upcoming Saturday
  if (text === 'this weekend' || text === 'weekend') {
    return toDateStr(getNextWeekday(6));
  }

  // "next weekend" → second Saturday
  if (text === 'next weekend') {
    const thisSat = getNextWeekday(6);
    return toDateStr(addDays(thisSat, 7));
  }

  // "end of week" / "eow" → Friday
  if (text === 'end of week' || text === 'eow') {
    return toDateStr(getNextWeekday(5));
  }

  // "end of month" / "eom" → last day of current month
  if (text === 'end of month' || text === 'eom') {
    return toDateStr(endOfMonth(today));
  }

  // "later this week" → 2 days from now, capped at Friday
  if (text === 'later this week') {
    const fri = getNextWeekday(5);
    const twoAhead = addDays(today, 2);
    return toDateStr(twoAhead <= fri ? twoAhead : fri);
  }

  // "someday" → 2 months from now
  if (text === 'someday') {
    return toDateStr(addMonths(today, 2));
  }

  // ── "in N <unit>" / "+N <unit>" ─────────────────────────────────────

  const relMatch = text.match(/^(?:in\s+|\+)(\d+)\s*(days?|weeks?|months?|years?)$/);
  if (relMatch) {
    const n = parseInt(relMatch[1]);
    const unit = relMatch[2].replace(/s$/, '');
    if (unit === 'day') return toDateStr(addDays(today, n));
    if (unit === 'week') return toDateStr(addDays(today, n * 7));
    if (unit === 'month') return toDateStr(addMonths(today, n));
    if (unit === 'year') return toDateStr(new Date(today.getFullYear() + n, today.getMonth(), today.getDate()));
  }

  // ── "N days/weeks/months before/after <date>" ───────────────────────

  const beforeAfterMatch = text.match(/^(\d+)\s+(days?|weeks?|months?)\s+(before|after)\s+(.+)$/);
  if (beforeAfterMatch) {
    const n = parseInt(beforeAfterMatch[1]);
    const unit = beforeAfterMatch[2].replace(/s$/, '');
    const dir = beforeAfterMatch[3] === 'before' ? -1 : 1;
    const anchorStr = parseNaturalDate(beforeAfterMatch[4]);
    if (anchorStr) {
      const anchor = new Date(anchorStr + 'T00:00:00');
      if (unit === 'day') return toDateStr(addDays(anchor, n * dir));
      if (unit === 'week') return toDateStr(addDays(anchor, n * 7 * dir));
      if (unit === 'month') return toDateStr(addMonths(anchor, n * dir));
    }
  }

  // ── "next [day]" — skip this week, go to next ──────────────────────

  const nextDayMatch = text.match(/^next\s+(.+)$/);
  if (nextDayMatch) {
    const dayIdx = parseDayName(nextDayMatch[1]);
    if (dayIdx !== -1) {
      const diff = (dayIdx - today.getDay() + 7) % 7 || 7;
      return toDateStr(addDays(today, diff + 7));
    }
    // "next [month]" — e.g. "next january" → 1st of that month
    const monthIdx = parseMonthName(nextDayMatch[1]);
    if (monthIdx !== -1) {
      const year = today.getFullYear();
      const candidate = new Date(year, monthIdx, 1);
      if (candidate <= today) candidate.setFullYear(year + 1);
      // If it's the current month, go to next year
      if (candidate.getMonth() === today.getMonth() && candidate.getFullYear() === today.getFullYear()) {
        candidate.setFullYear(year + 1);
      }
      return toDateStr(candidate);
    }
  }

  // ── "this [day]" — this week's occurrence ──────────────────────────

  const thisDayMatch = text.match(/^this\s+(.+)$/);
  if (thisDayMatch) {
    const dayIdx = parseDayName(thisDayMatch[1]);
    if (dayIdx !== -1) {
      const diff = (dayIdx - today.getDay() + 7) % 7 || 7;
      return toDateStr(addDays(today, diff));
    }
  }

  // ── Just a day name — "friday", "fri" ──────────────────────────────

  const dayIdx = parseDayName(text);
  if (dayIdx !== -1) {
    return toDateStr(getNextWeekday(dayIdx));
  }

  // ── "Nth" — e.g. "27th", "3rd" (current/next month) ───────────────

  const nthMatch = text.match(/^(\d{1,2})(?:st|nd|rd|th)$/);
  if (nthMatch) {
    const day = parseInt(nthMatch[1]);
    if (day >= 1 && day <= 31) {
      let candidate = new Date(today.getFullYear(), today.getMonth(), day);
      if (candidate < today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
      return toDateStr(candidate);
    }
  }

  // ── "mid [month]" — 15th of that month ─────────────────────────────

  const midMatch = text.match(/^mid\s+(.+)$/);
  if (midMatch) {
    const monthIdx = parseMonthName(midMatch[1]);
    if (monthIdx !== -1) {
      const year = today.getFullYear();
      const candidate = new Date(year, monthIdx, 15);
      if (candidate < today) candidate.setFullYear(year + 1);
      return toDateStr(candidate);
    }
  }

  // ── "end of [month]" — last day of named month ─────────────────────

  const endOfMatch = text.match(/^end\s+of\s+(.+)$/);
  if (endOfMatch) {
    const monthIdx = parseMonthName(endOfMatch[1]);
    if (monthIdx !== -1) {
      const year = today.getFullYear();
      const candidate = new Date(year, monthIdx + 1, 0); // last day
      if (candidate < today) candidate.setFullYear(year + 1);
      return toDateStr(candidate);
    }
  }

  // ── "Nth [day] [month]" — e.g. "3rd friday jan" ───────────────────

  const nthDayMonthMatch = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+([a-z]+)$/);
  if (nthDayMonthMatch) {
    const nth = parseInt(nthDayMonthMatch[1]);
    const dayWordIdx = parseDayName(nthDayMonthMatch[2]);
    const monthWordIdx = parseMonthName(nthDayMonthMatch[3]);
    if (dayWordIdx !== -1 && monthWordIdx !== -1 && nth >= 1 && nth <= 5) {
      const year = today.getFullYear();
      let candidate = nthWeekdayOfMonth(year, monthWordIdx, dayWordIdx, nth);
      if (!candidate || candidate < today) {
        candidate = nthWeekdayOfMonth(year + 1, monthWordIdx, dayWordIdx, nth);
      }
      if (candidate) return toDateStr(candidate);
    }
  }

  // ── "month day" — e.g. "march 15", "mar 15" ───────────────────────

  const monthDayMatch = text.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (monthDayMatch) {
    const monthIdx = parseMonthName(monthDayMatch[1]);
    if (monthIdx !== -1) {
      const day = parseInt(monthDayMatch[2]);
      if (day >= 1 && day <= 31) {
        const year = today.getFullYear();
        const candidate = new Date(year, monthIdx, day);
        if (candidate < today) candidate.setFullYear(year + 1);
        return toDateStr(candidate);
      }
    }
  }

  // ── "day month" — e.g. "15 march", "27 jan" ───────────────────────

  const dayMonthMatch = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1]);
    const monthIdx = parseMonthName(dayMonthMatch[2]);
    if (monthIdx !== -1 && day >= 1 && day <= 31) {
      const year = today.getFullYear();
      const candidate = new Date(year, monthIdx, day);
      if (candidate < today) candidate.setFullYear(year + 1);
      return toDateStr(candidate);
    }
  }

  // ── Full date formats ──────────────────────────────────────────────

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1]);
    const m = parseInt(isoMatch[2]) - 1;
    const d = parseInt(isoMatch[3]);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return toDateStr(new Date(y, m, d));
    }
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const usMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usMatch) {
    const m = parseInt(usMatch[1]) - 1;
    const d = parseInt(usMatch[2]);
    const y = parseInt(usMatch[3]);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return toDateStr(new Date(y, m, d));
    }
  }

  // M/D or M-D — e.g. "3/15", "03-15"
  const slashMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (slashMatch) {
    const m = parseInt(slashMatch[1]) - 1;
    const d = parseInt(slashMatch[2]);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      const year = today.getFullYear();
      const candidate = new Date(year, m, d);
      if (candidate < today) candidate.setFullYear(year + 1);
      return toDateStr(candidate);
    }
  }

  return null;
}

// ─── Suggestions Engine ───────────────────────────────────────────────────

export interface DateSuggestion {
  label: string;
  date: string;
  hint: string;
}

function formatHint(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function getDateSuggestions(input: string): DateSuggestion[] {
  const text = input.trim().toLowerCase();
  if (!text) return [];

  const today = getToday();
  const suggestions: DateSuggestion[] = [];
  const seen = new Set<string>();

  function add(label: string, d: Date) {
    const date = toDateStr(d);
    if (seen.has(date)) return;
    seen.add(date);
    suggestions.push({ label, date, hint: formatHint(d) });
  }

  // Static candidates — only shown when they fuzzy-match the input
  const candidates: { keywords: string[]; label: string; date: Date }[] = [
    { keywords: ['today', 'tod'], label: 'Today', date: today },
    { keywords: ['tomorrow', 'tom'], label: 'Tomorrow', date: addDays(today, 1) },
    { keywords: ['this weekend', 'weekend'], label: 'This weekend', date: getNextWeekday(6) },
    { keywords: ['next weekend'], label: 'Next weekend', date: addDays(getNextWeekday(6), 7) },
    { keywords: ['next week'], label: 'Next week', date: getNextWeekday(1) },
    { keywords: ['next month'], label: 'Next month', date: addMonths(today, 1) },
    { keywords: ['end of week', 'eow'], label: 'End of week', date: getNextWeekday(5) },
    { keywords: ['end of month', 'eom'], label: 'End of month', date: endOfMonth(today) },
    { keywords: ['later this week'], label: 'Later this week', date: (() => { const fri = getNextWeekday(5); const t = addDays(today, 2); return t <= fri ? t : fri; })() },
    { keywords: ['no date', 'no due date'], label: 'No date', date: today }, // special
  ];

  // Day names as candidates
  for (let i = 0; i < 7; i++) {
    const d = getNextWeekday(i);
    candidates.push({
      keywords: [DAY_NAMES[i], DAY_ABBREVS[i]],
      label: DAY_NAMES[i].charAt(0).toUpperCase() + DAY_NAMES[i].slice(1),
      date: d,
    });
    candidates.push({
      keywords: [`next ${DAY_NAMES[i]}`, `next ${DAY_ABBREVS[i]}`],
      label: `Next ${DAY_NAMES[i].charAt(0).toUpperCase() + DAY_NAMES[i].slice(1)}`,
      date: addDays(getNextWeekday(i), 7),
    });
  }

  // "in N days" for small N
  for (const n of [2, 3, 5, 7]) {
    candidates.push({
      keywords: [`in ${n} days`, `+${n} days`, `${n} days`],
      label: `In ${n} days`,
      date: addDays(today, n),
    });
  }

  // "in N weeks"
  for (const n of [2, 3, 4]) {
    candidates.push({
      keywords: [`in ${n} weeks`, `+${n} weeks`, `${n} weeks`],
      label: `In ${n} weeks`,
      date: addDays(today, n * 7),
    });
  }

  // Match candidates against input
  for (const c of candidates) {
    const matches = c.keywords.some(k => k.startsWith(text) || k.includes(text));
    if (matches) {
      if (c.keywords.includes('no date') || c.keywords.includes('no due date')) {
        if (!seen.has('')) {
          seen.add('');
          suggestions.push({ label: 'No date', date: '', hint: 'Remove due date' });
        }
      } else {
        add(c.label, c.date);
      }
    }
  }

  // If input starts with a number, try to suggest relative dates
  const numStart = text.match(/^(\d+)\s*$/);
  if (numStart) {
    const n = parseInt(numStart[1]);
    if (n >= 1 && n <= 31) {
      // Suggest as "Nth of this/next month"
      const thisMonth = new Date(today.getFullYear(), today.getMonth(), n);
      if (isFuture(thisMonth, today)) {
        add(`${n}${ordinalSuffix(n)} of this month`, thisMonth);
      }
      const nextMo = new Date(today.getFullYear(), today.getMonth() + 1, n);
      add(`${n}${ordinalSuffix(n)} of next month`, nextMo);
    }
  }

  // Check if the input itself parses to a date
  const parsed = parseNaturalDate(text);
  if (parsed && parsed !== '' && !seen.has(parsed)) {
    const d = new Date(parsed + 'T00:00:00');
    add(text.charAt(0).toUpperCase() + text.slice(1), d);
  }

  return suggestions.slice(0, 6);
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ─── Smart Date Extraction from Task Title ────────────────────────────────
// Scans text for date phrases and returns the cleaned title + extracted date.

const DATE_PATTERNS: RegExp[] = [
  // "tomorrow", "today", "yesterday"
  /\b(today|tod|tomorrow|tom|yesterday)\b/,
  // "next week/month/year/weekend"
  /\b(next\s+(?:week|month|year|weekend))\b/,
  // "this weekend", "end of week/month"
  /\b(this\s+weekend|end\s+of\s+(?:week|month|[a-z]+)|later\s+this\s+week)\b/,
  // "next [day]" — e.g. "next friday"
  /\b(next\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat))\b/,
  // "this [day]"
  /\b(this\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat))\b/,
  // "in N days/weeks/months"
  /\b(in\s+\d+\s+(?:days?|weeks?|months?))\b/,
  // "mid [month]"
  /\b(mid\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/,
  // "month day" — e.g. "march 15", "mar 15th"
  /\b((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?)\b/,
  // "day month" — e.g. "15 march", "27th jan"
  /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/,
  // Day name alone (at word boundary) — "friday", "fri"
  /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
];

export interface ExtractedDate {
  cleanTitle: string;
  date: string;
  matchedText: string;
}

export function extractDateFromText(text: string): ExtractedDate | null {
  const lower = text.toLowerCase();

  for (const pattern of DATE_PATTERNS) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const parsed = parseNaturalDate(match[1]);
      if (parsed !== null) {
        // Remove the matched text from the title, trim extra spaces
        const startIdx = match.index!;
        const endIdx = startIdx + match[0].length;
        const cleaned = (text.slice(0, startIdx) + text.slice(endIdx))
          .replace(/\s{2,}/g, ' ')
          .trim();
        return {
          cleanTitle: cleaned,
          date: parsed,
          matchedText: match[1],
        };
      }
    }
  }

  return null;
}

// ─── Recurrence Parsing ───────────────────────────────────────────────────

export interface RecurrenceRule {
  /** The normalized recurrence pattern, e.g. "every week", "every 3 days" */
  pattern: string;
  /** If true, next date is calculated from completion date ("every!") */
  fromCompletion: boolean;
  /** The first due date for this recurrence */
  firstDueDate: string;
}

const DAY_NAMES_RE = '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)';

/**
 * Parses a recurrence string and returns a RecurrenceRule with the first due date.
 */
export function parseRecurrence(input: string): RecurrenceRule | null {
  const text = input.trim().toLowerCase().replace(/,/g, '');
  if (!text) return null;

  const today = getToday();
  let fromCompletion = false;
  let working = text;

  // Detect "every!" or "after" prefix (completion-based)
  if (working.startsWith('every!')) {
    fromCompletion = true;
    working = 'every' + working.slice(6);
  } else if (working.startsWith('after ')) {
    fromCompletion = true;
    working = 'every ' + working.slice(6);
  }

  // Extract "starting [date]" suffix
  let startDate: string | null = null;
  const startingMatch = working.match(/\s+starting\s+(?:on\s+)?(.+?)(?:\s+ending|\s+for\s+|$)/);
  if (startingMatch) {
    startDate = parseNaturalDate(startingMatch[1]);
    working = working.replace(/\s+starting\s+(?:on\s+)?.+?(?=\s+ending|\s+for\s+|$)/, '');
  }

  // Strip ending/for/until suffixes
  working = working.replace(/\s+ending\s+.+$/, '').replace(/\s+for\s+\d+\s+\w+$/, '').replace(/\s+(?:from|until)\s+.+$/, '').trim();

  // ── Aliases ─────────────────────────────────────────────────────────

  if (working === 'daily' || working === 'every day') {
    return { pattern: 'every day', fromCompletion, firstDueDate: startDate ?? toDateStr(today) };
  }
  if (working === 'weekly' || working === 'every week') {
    return { pattern: 'every week', fromCompletion, firstDueDate: startDate ?? toDateStr(today) };
  }
  if (working === 'monthly' || working === 'every month') {
    return { pattern: 'every month', fromCompletion, firstDueDate: startDate ?? toDateStr(today) };
  }
  if (working === 'yearly' || working === 'every year') {
    return { pattern: 'every year', fromCompletion, firstDueDate: startDate ?? toDateStr(today) };
  }

  // "every other day/week/month/year"
  const otherMatch = working.match(/^every\s+other\s+(day|week|month|year)$/);
  if (otherMatch) {
    return { pattern: `every 2 ${otherMatch[1]}s`, fromCompletion, firstDueDate: startDate ?? toDateStr(today) };
  }

  // "every weekday/workday"
  if (working === 'every weekday' || working === 'every workday') {
    const d = new Date(today);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return { pattern: 'every weekday', fromCompletion, firstDueDate: startDate ?? toDateStr(d) };
  }

  // "every weekend"
  if (working === 'every weekend') {
    return { pattern: 'every weekend', fromCompletion, firstDueDate: startDate ?? toDateStr(getNextWeekday(6)) };
  }

  // "every N days/weeks/months/years"
  const intervalMatch = working.match(/^every\s+(\d+)\s+(days?|weeks?|months?|years?)$/);
  if (intervalMatch) {
    const n = parseInt(intervalMatch[1]);
    const unit = intervalMatch[2].replace(/s$/, '');
    return { pattern: `every ${n} ${unit}s`, fromCompletion, firstDueDate: startDate ?? toDateStr(today) };
  }

  // "every [day name(s)]" — e.g. "every monday", "every mon fri"
  const everyDayMatch = working.match(new RegExp(`^every\\s+(${DAY_NAMES_RE}(?:\\s+${DAY_NAMES_RE})*)$`));
  if (everyDayMatch) {
    const dayWords = everyDayMatch[1].split(/\s+/);
    const dayIndices = dayWords.map(parseDayName).filter((i) => i !== -1);
    if (dayIndices.length > 0) {
      const daysAhead = dayIndices.map((d) => ((d - today.getDay() + 7) % 7) || 7);
      const minAhead = Math.min(...daysAhead);
      const firstDue = startDate ?? toDateStr(addDays(today, minAhead));
      const dayLabels = dayIndices.map((d) => DAY_ABBREVS[d]);
      return { pattern: `every ${dayLabels.join(', ')}`, fromCompletion, firstDueDate: firstDue };
    }
  }

  // "every Nth [day]" — e.g. "every 3rd friday"
  const nthDayMatch = working.match(new RegExp(`^every\\s+(\\d+)(?:st|nd|rd|th)?\\s+(${DAY_NAMES_RE})$`));
  if (nthDayMatch) {
    const nth = parseInt(nthDayMatch[1]);
    const dayWordIdx = parseDayName(nthDayMatch[2]);
    if (dayWordIdx !== -1 && nth >= 1 && nth <= 5) {
      let candidate = nthWeekdayOfMonth(today.getFullYear(), today.getMonth(), dayWordIdx, nth);
      if (!candidate || candidate <= today) {
        const nm = today.getMonth() + 1;
        candidate = nthWeekdayOfMonth(nm > 11 ? today.getFullYear() + 1 : today.getFullYear(), nm % 12, dayWordIdx, nth);
      }
      return { pattern: `every ${nth}${ordinalSuffix(nth)} ${DAY_NAMES[dayWordIdx]}`, fromCompletion, firstDueDate: startDate ?? (candidate ? toDateStr(candidate) : toDateStr(today)) };
    }
  }

  // "every Nth" — monthly on that date
  const everyNthMatch = working.match(/^every\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (everyNthMatch) {
    const day = parseInt(everyNthMatch[1]);
    if (day >= 1 && day <= 31) {
      let candidate = new Date(today.getFullYear(), today.getMonth(), day);
      if (candidate <= today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
      return { pattern: `every ${day}${ordinalSuffix(day)}`, fromCompletion, firstDueDate: startDate ?? toDateStr(candidate) };
    }
  }

  // "every [month] [day]" — yearly
  const everyMonthDayMatch = working.match(new RegExp(`^every\\s+(${DAY_NAMES_RE.replace('?:', '')})\\s+(\\d{1,2})(?:st|nd|rd|th)?$`));
  if (!everyMonthDayMatch) {
    // Try month name pattern
    const MONTH_RE = '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)';
    const everyMDMatch = working.match(new RegExp(`^every\\s+(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?$`));
    if (everyMDMatch) {
      const monthIdx = parseMonthName(everyMDMatch[1]);
      const day = parseInt(everyMDMatch[2]);
      if (monthIdx !== -1 && day >= 1 && day <= 31) {
        const candidate = new Date(today.getFullYear(), monthIdx, day);
        if (candidate <= today) candidate.setFullYear(candidate.getFullYear() + 1);
        return { pattern: `every ${MONTH_ABBREVS[monthIdx]} ${day}`, fromCompletion, firstDueDate: startDate ?? toDateStr(candidate) };
      }
    }
  }

  // "every last day"
  if (working === 'every last day') {
    const eom = endOfMonth(today);
    const firstDue = eom <= today ? endOfMonth(addMonths(today, 1)) : eom;
    return { pattern: 'every last day', fromCompletion, firstDueDate: startDate ?? toDateStr(firstDue) };
  }

  // "every first/last workday"
  const workdayMatch = working.match(/^every\s+(first|last)\s+(?:workday|weekday)$/);
  if (workdayMatch) {
    return { pattern: `every ${workdayMatch[1]} workday`, fromCompletion, firstDueDate: startDate ?? toDateStr(today) };
  }

  return null;
}

/**
 * Given a recurrence pattern and the current due date, calculate the next due date.
 * If fromCompletion is true, `currentDue` should be the completion date (today).
 */
export function getNextRecurrenceDate(pattern: string, currentDue: string): string | null {
  const base = new Date(currentDue + 'T00:00:00');
  const text = pattern.toLowerCase();

  if (text === 'every day') return toDateStr(addDays(base, 1));
  if (text === 'every week') return toDateStr(addDays(base, 7));
  if (text === 'every month') return toDateStr(addMonths(base, 1));
  if (text === 'every year') {
    const next = new Date(base);
    next.setFullYear(next.getFullYear() + 1);
    return toDateStr(next);
  }

  // "every N units"
  const intervalMatch = text.match(/^every\s+(\d+)\s+(days?|weeks?|months?|years?)$/);
  if (intervalMatch) {
    const n = parseInt(intervalMatch[1]);
    const unit = intervalMatch[2].replace(/s$/, '');
    if (unit === 'day') return toDateStr(addDays(base, n));
    if (unit === 'week') return toDateStr(addDays(base, n * 7));
    if (unit === 'month') return toDateStr(addMonths(base, n));
    if (unit === 'year') {
      const next = new Date(base);
      next.setFullYear(next.getFullYear() + n);
      return toDateStr(next);
    }
  }

  // "every weekday"
  if (text === 'every weekday') {
    let next = addDays(base, 1);
    while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
    return toDateStr(next);
  }

  // "every weekend"
  if (text === 'every weekend') {
    let next = addDays(base, 1);
    while (next.getDay() !== 6) next = addDays(next, 1);
    return toDateStr(next);
  }

  // "every [day abbrevs]" — e.g. "every mon, fri"
  const dayParts = text.match(/^every\s+(.+)$/);
  if (dayParts) {
    const parts = dayParts[1].split(/[\s,]+/).map(parseDayName).filter((i) => i !== -1);
    if (parts.length > 0 && parts.length <= 7) {
      for (let ahead = 1; ahead <= 7; ahead++) {
        const candidate = addDays(base, ahead);
        if (parts.includes(candidate.getDay())) return toDateStr(candidate);
      }
    }
  }

  // "every Nth [day]" — e.g. "every 3rd friday"
  const nthDayMatch = text.match(/^every\s+(\d+)(?:st|nd|rd|th)?\s+(\w+)$/);
  if (nthDayMatch) {
    const nth = parseInt(nthDayMatch[1]);
    const dayIdx = parseDayName(nthDayMatch[2]);
    if (dayIdx !== -1 && nth >= 1 && nth <= 5) {
      for (let m = 1; m <= 13; m++) {
        const futureMonth = new Date(base.getFullYear(), base.getMonth() + m, 1);
        const candidate = nthWeekdayOfMonth(futureMonth.getFullYear(), futureMonth.getMonth(), dayIdx, nth);
        if (candidate && candidate > base) return toDateStr(candidate);
      }
    }
  }

  // "every Nth" — monthly on that date
  const everyNthMatch = text.match(/^every\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (everyNthMatch) {
    const day = parseInt(everyNthMatch[1]);
    return toDateStr(new Date(base.getFullYear(), base.getMonth() + 1, day));
  }

  // "every last day"
  if (text === 'every last day') {
    return toDateStr(endOfMonth(addMonths(base, 1)));
  }

  return null;
}

// ─── Recurrence Extraction from Task Title ────────────────────────────────

const RECURRENCE_PATTERNS: RegExp[] = [
  // "every!/after" completion-based
  /\b((?:every!|after)\s+\d+\s+(?:days?|weeks?|months?|years?))\b/,
  // "every N units"
  /\b(every\s+\d+\s+(?:days?|weeks?|months?|years?))\b/,
  // "every other day/week/month"
  /\b(every\s+other\s+(?:day|week|month|year))\b/,
  // "every Nth [day]" — "every 3rd friday"
  new RegExp(`\\b(every\\s+\\d+(?:st|nd|rd|th)?\\s+${DAY_NAMES_RE})\\b`),
  // "every [day names]"
  new RegExp(`\\b(every\\s+${DAY_NAMES_RE}(?:\\s+${DAY_NAMES_RE})*)\\b`),
  // "every weekday/workday/weekend"
  /\b(every\s+(?:weekday|workday|weekend))\b/,
  // "every last day" / "every first/last workday"
  /\b(every\s+(?:last\s+day|(?:first|last)\s+(?:workday|weekday)))\b/,
  // "every Nth" — "every 27th"
  /\b(every\s+\d{1,2}(?:st|nd|rd|th))\b/,
  // "every [month] [day]"
  /\b(every\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?)\b/,
  // Aliases
  /\b(daily|weekly|monthly|yearly)\b/,
];

export interface ExtractedRecurrence {
  cleanTitle: string;
  recurrence: RecurrenceRule;
  matchedText: string;
}

export function extractRecurrenceFromText(text: string): ExtractedRecurrence | null {
  const lower = text.toLowerCase();

  for (const pattern of RECURRENCE_PATTERNS) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      const rule = parseRecurrence(match[1]);
      if (rule) {
        const startIdx = match.index!;
        const endIdx = startIdx + match[0].length;
        const cleaned = (text.slice(0, startIdx) + text.slice(endIdx))
          .replace(/\s{2,}/g, ' ')
          .trim();
        return {
          cleanTitle: cleaned,
          recurrence: rule,
          matchedText: match[1],
        };
      }
    }
  }

  return null;
}
