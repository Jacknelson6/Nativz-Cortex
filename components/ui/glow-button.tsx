'use client';

import { ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
}

const glowFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-[0_0_0_3px_var(--focus-ring)]';

export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ children, loading, disabled, className, type = 'button', ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          'glow-btn rounded-xl text-sm font-medium cursor-pointer',
          'transition-transform duration-[var(--duration-fast)] ease-out',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          glowFocus,
          className,
        )}
        {...props}
      >
        <span className="glow-btn-inner rounded-[11px]">
          {loading ? <Loader2 size={14} className="animate-spin text-text-muted" /> : null}
          <span className="flex items-center gap-2 text-text-primary">{children}</span>
        </span>
      </button>
    );
  },
);

GlowButton.displayName = 'GlowButton';
