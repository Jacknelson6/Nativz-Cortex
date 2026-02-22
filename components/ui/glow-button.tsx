'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
}

export function GlowButton({ children, loading, disabled, className = '', ...props }: GlowButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={`glow-btn rounded-xl text-sm font-medium cursor-pointer transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      <span className="glow-btn-inner rounded-[11px]">
        {loading ? <Loader2 size={14} className="animate-spin text-text-muted" /> : null}
        <span className="flex items-center gap-2 text-text-primary">{children}</span>
      </span>
    </button>
  );
}
