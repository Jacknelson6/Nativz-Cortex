'use client';

import { ButtonHTMLAttributes, forwardRef, useCallback, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ loading, disabled, children, className = '', onClick, type = 'button', ...props }, ref) => {
    const [shaking, setShaking] = useState(false);
    const shakeTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (loading) return;
        if (disabled) {
          e.preventDefault();
          setShaking(true);
          clearTimeout(shakeTimeout.current);
          shakeTimeout.current = setTimeout(() => setShaking(false), 400);
          return;
        }
        onClick?.(e);
      },
      [disabled, loading, onClick],
    );

    return (
      <button
        ref={ref}
        type={type}
        className={`
          group relative inline-flex items-center justify-center gap-2.5
          rounded-xl px-6 py-3 text-sm font-semibold cursor-pointer
          text-accent-text
          backdrop-blur-[20px]
          bg-accent-surface
          border border-accent/25
          shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]
          transition-all duration-200 ease-out
          hover:bg-accent/20
          hover:border-accent/40
          hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_0_20px_var(--accent-surface)]
          active:scale-[0.97] active:bg-accent/25
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background
          ${disabled || loading ? 'opacity-40' : ''}
          ${shaking ? 'animate-shake' : ''}
          ${className}
        `}
        onClick={handleClick}
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
