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
          bg-[rgba(43,125,233,0.08)]
          border border-[rgba(43,125,233,0.20)]
          shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]
          transition-all duration-200 ease-out
          hover:bg-[rgba(43,125,233,0.15)]
          hover:border-[rgba(43,125,233,0.35)]
          hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_0_20px_rgba(43,125,233,0.15)]
          active:scale-[0.97] active:bg-[rgba(43,125,233,0.20)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background
          ${loading ? 'opacity-50 pointer-events-none' : disabled ? 'opacity-50' : ''}
          ${shaking ? 'animate-shake' : ''}
          ${className}
        `}
        disabled={loading}
        aria-disabled={disabled || loading}
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
