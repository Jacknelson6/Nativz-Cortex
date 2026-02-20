'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ loading, disabled, children, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          group relative inline-flex w-full items-center justify-center gap-2.5
          rounded-xl px-6 py-3 text-sm font-semibold
          text-accent-text
          backdrop-blur-[20px]
          bg-[rgba(4,107,210,0.12)]
          border border-[rgba(4,107,210,0.25)]
          shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]
          transition-all duration-200 ease-out
          hover:bg-[rgba(4,107,210,0.2)]
          hover:border-[rgba(4,107,210,0.4)]
          hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_0_20px_rgba(4,107,210,0.15)]
          active:scale-[0.97] active:bg-[rgba(4,107,210,0.25)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background
          disabled:opacity-40 disabled:pointer-events-none
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Starting...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

GlassButton.displayName = 'GlassButton';
