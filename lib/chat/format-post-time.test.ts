import { describe, expect, it } from 'vitest';
import { formatPostTimeForChat } from './format-post-time';

/**
 * formatPostTimeForChat renders a scheduled post timestamp as a stable
 * Google Chat one-liner like "Tue May 6 at 9:00 AM ET". Used in review +
 * comment notifications so the agency team can identify which post a
 * reviewer is acting on without opening the share link. Three contracts
 * to pin:
 *
 *   1. Returns null (not a partial / fallback string) when the input is
 *      empty or unparseable. Callers omit the line entirely on null; a
 *      regression that returned the literal "Invalid Date" or an empty
 *      string would push that into the chat message verbatim.
 *
 *   2. Always renders in America/New_York with the literal "ET" suffix.
 *      The agency operates on Eastern, so notifications must consistently
 *      label that timezone regardless of where the server is running.
 *      A regression that dropped the timezone, or rendered in UTC, would
 *      mean reviewers acting on the wrong post.
 *
 *   3. The shape is "Weekday Mon Day at H:MM AM/PM ET" with single spaces.
 *      Copy review and downstream regex matchers in the chat-export tests
 *      rely on this exact arrangement; a change must be deliberate.
 */

describe('formatPostTimeForChat — null safety', () => {
  it('returns null for null input', () => {
    expect(formatPostTimeForChat(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatPostTimeForChat(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(formatPostTimeForChat('')).toBeNull();
  });

  it('returns null for an unparseable date string', () => {
    expect(formatPostTimeForChat('not-a-date')).toBeNull();
  });

  it('returns null for the literal "Invalid Date" string', () => {
    expect(formatPostTimeForChat('Invalid Date')).toBeNull();
  });
});

describe('formatPostTimeForChat — output shape', () => {
  it('renders a typical UTC ISO timestamp in ET with the canonical shape', () => {
    // 2026-05-06T13:00:00Z = Wed May 6 at 9:00 AM ET (EDT, UTC-4)
    const out = formatPostTimeForChat('2026-05-06T13:00:00Z');
    expect(out).toBe('Wed May 6 at 9:00 AM ET');
  });

  it('always ends with " ET" so reviewers know the timezone', () => {
    expect(formatPostTimeForChat('2026-05-06T13:00:00Z')).toMatch(/ ET$/);
  });

  it('uses the abbreviated weekday (Mon/Tue/Wed/...)', () => {
    // Pin: short weekday — full name "Wednesday" would push the line over
    // the comfortable chat width.
    const out = formatPostTimeForChat('2026-05-06T13:00:00Z');
    expect(out).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /);
  });

  it('uses the abbreviated month (Jan/Feb/.../Dec)', () => {
    const out = formatPostTimeForChat('2026-01-15T13:00:00Z');
    expect(out).toMatch(/ Jan /);
  });

  it('does not zero-pad the day (May 6, not May 06)', () => {
    // Pin: `day: 'numeric'` not `'2-digit'`. The 'May 06' shape would look
    // off in chat copy.
    const out = formatPostTimeForChat('2026-05-06T13:00:00Z');
    expect(out).toContain(' May 6 ');
    expect(out).not.toContain(' May 06 ');
  });

  it('does not zero-pad the hour (9:00, not 09:00)', () => {
    // hour: 'numeric' is unpadded; minute: '2-digit' is padded. Pin both.
    const out = formatPostTimeForChat('2026-05-06T13:00:00Z');
    expect(out).toMatch(/at 9:00 AM/);
  });

  it('zero-pads the minute (9:05, not 9:5)', () => {
    const out = formatPostTimeForChat('2026-05-06T13:05:00Z');
    expect(out).toMatch(/at 9:05 AM/);
  });

  it('renders PM for afternoon ET times', () => {
    // 2026-05-06T20:30:00Z = Wed May 6 at 4:30 PM ET (EDT, UTC-4)
    expect(formatPostTimeForChat('2026-05-06T20:30:00Z')).toBe('Wed May 6 at 4:30 PM ET');
  });

  it('renders AM for morning ET times', () => {
    // 2026-05-06T11:00:00Z = Wed May 6 at 7:00 AM ET (EDT)
    expect(formatPostTimeForChat('2026-05-06T11:00:00Z')).toMatch(/ AM ET$/);
  });
});

describe('formatPostTimeForChat — timezone correctness', () => {
  it('renders in ET regardless of the offset in the input', () => {
    // 2026-05-06T13:00:00+00:00 and 2026-05-06T09:00:00-04:00 are the same
    // instant; both should render identically.
    const a = formatPostTimeForChat('2026-05-06T13:00:00Z');
    const b = formatPostTimeForChat('2026-05-06T09:00:00-04:00');
    expect(a).toBe(b);
    expect(a).toBe('Wed May 6 at 9:00 AM ET');
  });

  it('crosses the date boundary correctly when ET and UTC differ', () => {
    // 2026-05-07T03:30:00Z = Wed May 6 at 11:30 PM ET (EDT, UTC-4).
    // The ET date is the previous calendar day.
    expect(formatPostTimeForChat('2026-05-07T03:30:00Z')).toBe('Wed May 6 at 11:30 PM ET');
  });

  it('handles winter-time (EST, UTC-5) instants', () => {
    // 2026-01-15T14:00:00Z = Thu Jan 15 at 9:00 AM ET (EST, UTC-5).
    expect(formatPostTimeForChat('2026-01-15T14:00:00Z')).toBe('Thu Jan 15 at 9:00 AM ET');
  });

  it('handles summer-time (EDT, UTC-4) instants', () => {
    // Same wall-clock 9:00 AM in July maps to UTC-4, so the UTC instant is 13:00Z.
    expect(formatPostTimeForChat('2026-07-15T13:00:00Z')).toBe('Wed Jul 15 at 9:00 AM ET');
  });
});

describe('formatPostTimeForChat — boundary times', () => {
  it('renders midnight ET as 12:00 AM (not 0:00)', () => {
    // 2026-05-06T04:00:00Z = Wed May 6 at 12:00 AM ET (EDT).
    expect(formatPostTimeForChat('2026-05-06T04:00:00Z')).toBe('Wed May 6 at 12:00 AM ET');
  });

  it('renders noon ET as 12:00 PM (not 0:00)', () => {
    // 2026-05-06T16:00:00Z = Wed May 6 at 12:00 PM ET (EDT).
    expect(formatPostTimeForChat('2026-05-06T16:00:00Z')).toBe('Wed May 6 at 12:00 PM ET');
  });
});
