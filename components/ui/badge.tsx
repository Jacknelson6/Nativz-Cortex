import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'mono';

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/[0.08] text-white/50 ring-1 ring-inset ring-white/10',
  mono: 'bg-white/[0.08] text-white/50 ring-1 ring-inset ring-white/10',
  success: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-400 ring-1 ring-inset ring-amber-500/20',
  danger: 'bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/20',
  info: 'bg-blue-500/15 text-blue-400 ring-1 ring-inset ring-blue-500/20',
  purple: 'bg-purple-500/15 text-purple-400 ring-1 ring-inset ring-purple-500/20',
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
