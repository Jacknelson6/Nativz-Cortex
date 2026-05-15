'use client';

/**
 * PRD 05: tiny inline chip that surfaces the server-enforced role of a
 * comment author. Three variants:
 *
 *  - admin  → "Team"   (accent tint; this is the agency posting back to the
 *                       client)
 *  - viewer → "Client" (cool tint; an authenticated client-side user)
 *  - guest  → omitted  (no chip; guest comments already read as "someone
 *                       from the client side typed a name and posted" — a
 *                       label here adds noise without adding signal)
 *
 * The chip is decorative, not interactive. Keep it small enough to nest in
 * the comment header row without throwing off line-height.
 */
export function RoleChip({
  role,
  className = '',
}: {
  role: 'admin' | 'viewer' | 'guest';
  className?: string;
}) {
  if (role === 'guest') return null;
  const isAdmin = role === 'admin';
  const label = isAdmin ? 'Team' : 'Client';
  const tone = isAdmin
    ? 'bg-accent/15 text-accent-text ring-accent/30'
    : 'bg-surface-hover text-text-secondary ring-nativz-border';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider ring-1 ${tone} ${className}`}
      aria-label={`Posted by ${label.toLowerCase()}`}
    >
      {label}
    </span>
  );
}
