/**
 * Meeting note classification for Fyxer imports and admin UI.
 * Pure helpers — no I/O.
 */

const RECURRING_HINTS =
  /\b(bi-?weekly|weekly|monthly|quarterly|recurring|stand[- ]?up|standup|sync|check[- ]?in|cadence|office hours|1:1s?|one[- ]?on[- ]?one|touchpoint|status)\b/i;

const RECURRING_DATE_PHRASE = /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/**
 * Classify meeting as recurring vs one-off from title / subject text.
 */
export function inferMeetingSeriesFromText(text: string): 'recurring' | 'adhoc' {
  const t = text.trim();
  if (!t) return 'adhoc';
  if (RECURRING_HINTS.test(t) || RECURRING_DATE_PHRASE.test(t)) return 'recurring';
  return 'adhoc';
}

/** Fyxer note titles are `Meeting notes YYYY-MM-DD — {email subject}` */
export function extractFyxerSubjectFromNoteTitle(title: string): string {
  const sep = ' — ';
  const idx = title.indexOf(sep);
  if (idx === -1) return title.trim();
  return title.slice(idx + sep.length).trim();
}

/**
 * Best-effort company / counterparty label from email subject when there is no client match.
 */
export function extractCompanyLabelFromSubject(subject: string): string {
  let s = subject.trim();
  s = s.replace(/\s*[/|]\s*Bi-?Weekly.*$/i, '');
  s = s.replace(/\s*[x×]\s*Nativz.*$/i, '');
  s = s.replace(/\s+with\s+Nativz.*$/i, '');
  s = s.replace(/\s*[|\u2014\u2013-]\s*Nativz.*$/i, '');
  const out = s.trim();
  return out || subject.trim();
}

export function meetingDateSortKey(metadata: Record<string, unknown> | null, createdAt: string): number {
  const raw = metadata?.meeting_date;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const t = Date.parse(raw + 'T12:00:00');
    if (!Number.isNaN(t)) return t;
  }
  return Date.parse(createdAt) || 0;
}
