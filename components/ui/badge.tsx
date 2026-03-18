import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'mono' | 'emerald';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-hover text-text-muted ring-1 ring-inset ring-nativz-border',
  mono: 'bg-surface-hover text-text-muted ring-1 ring-inset ring-nativz-border',
  success: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/20',
  danger: 'bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/20',
  info: 'bg-accent-surface text-accent-text ring-1 ring-inset ring-accent/20',
  purple: 'bg-accent2-surface text-accent2-text ring-1 ring-inset ring-accent2/20',
  emerald: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/20',
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
