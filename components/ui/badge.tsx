import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'mono' | 'emerald';

// Status variants route through brand tokens (--status-*) so they stop
// reading as raw Tailwind. `emerald` is kept as an explicit alias to
// `success` for historical call-sites that named it literally.
const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-hover text-text-muted ring-1 ring-inset ring-nativz-border',
  mono: 'bg-surface-hover text-text-muted ring-1 ring-inset ring-nativz-border',
  success:
    'bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] ring-1 ring-inset ring-[color:var(--status-success)]/25',
  warning:
    'bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] ring-1 ring-inset ring-[color:var(--status-warning)]/25',
  danger:
    'bg-[color:var(--status-danger)]/15 text-[color:var(--status-danger)] ring-1 ring-inset ring-[color:var(--status-danger)]/25',
  info: 'bg-accent-surface text-accent-text ring-1 ring-inset ring-accent/20',
  purple: 'bg-accent2-surface text-accent2-text ring-1 ring-inset ring-accent2/20',
  emerald:
    'bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] ring-1 ring-inset ring-[color:var(--status-success)]/25',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
