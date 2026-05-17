'use client';

/**
 * Inline chip that surfaces the server-enforced role of a comment author.
 * Post-322 the chip is admin-only: it labels agency authors so the client
 * can tell "the team replied" apart from their own comments. Viewer and
 * guest authors render no chip — their name + the context (their own
 * share link, signed in as themselves) already says everything.
 *
 * Decorative, not interactive. Keep it small enough to nest in the
 * comment header row without throwing off line-height.
 */
export function RoleChip({
  role,
  className = '',
}: {
  role: 'admin' | 'viewer' | 'guest';
  className?: string;
}) {
  if (role !== 'admin') return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full bg-accent/15 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider text-accent-text ring-1 ring-accent/30 ${className}`}
      aria-label="Posted by the team"
    >
      Team
    </span>
  );
}
