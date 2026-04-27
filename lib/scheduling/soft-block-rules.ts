/**
 * Soft-block rules for scheduling.
 *
 * An event whose title matches one of these patterns is treated as
 * visible-but-not-blocking when computing slot availability. The canonical
 * case is "shoot" — only one teammate (usually Jake) is on set, so the rest
 * of the team can still be booked into other meetings during that window.
 *
 * Mirrored on the client (the new-event form's "soft-blocker detected" pill)
 * and on the server (Google events.list reader filters busy ranges through
 * `isSoftBlockedTitle`). Keep both in sync by importing from this module.
 */
export const SOFT_BLOCK_TITLE_PATTERNS: readonly RegExp[] = [/\bshoot\b/i];

export function isSoftBlockedTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return SOFT_BLOCK_TITLE_PATTERNS.some((re) => re.test(title));
}
