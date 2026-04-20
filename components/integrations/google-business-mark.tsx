'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Google Business Profile: multicolor "G" glyph on transparent, or white G on brand tile. */
export function GoogleBusinessMark({
  size = 18,
  className,
  variant = 'full',
}: {
  size?: number;
  className?: string;
  variant?: 'full' | 'onBrand';
}) {
  const clipId = `gb-${useId().replace(/:/g, '')}`;

  if (variant === 'onBrand') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={cn('shrink-0 text-white', className)}
        aria-hidden
      >
        <path
          d="M12 10.91v2.4h5.63a4.9 4.9 0 01-2.12 3.23l-.02.12 3.08 2.39.22.02c1.96-1.8 3.09-4.47 3.09-7.64 0-.77-.07-1.51-.2-2.22H12z"
          fill="currentColor"
        />
        <path
          d="M12 21.5c2.79 0 5.13-.92 6.84-2.5l-3.26-2.53c-.87.61-2.04 1.04-3.58 1.04a6.21 6.21 0 01-5.87-4.29l-.12.01-3.2 2.48-.04.11A10.5 10.5 0 0012 21.5z"
          fill="currentColor"
          opacity="0.85"
        />
        <path
          d="M6.13 13.22a6.45 6.45 0 010-4.03L6.13 9.1 2.87 6.56l-.11.05a10.51 10.51 0 000 9.41l3.37-2.61z"
          fill="currentColor"
          opacity="0.7"
        />
        <path
          d="M12 6.01c1.96 0 3.28.85 4.03 1.56l2.95-2.88C17.12 3.13 14.79 2.11 12 2.11a10.5 10.5 0 00-9.24 5.5l3.36 2.61A6.23 6.23 0 0112 6.01z"
          fill="currentColor"
          opacity="0.55"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <clipPath id={clipId}>
        <path d="M0 0h24v24H0z" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.28-1.93-6.15-4.53H2.18v2.84A10.997 10.997 0 0012 23z"
          fill="#34A853"
        />
        <path
          d="M5.85 14.11A6.6 6.6 0 015.5 12c0-.73.13-1.44.35-2.11V7.05H2.18A10.997 10.997 0 001 12c0 1.77.42 3.44 1.18 4.95l3.67-2.84z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A10.997 10.997 0 002.18 7.05l3.67 2.84C6.72 7.31 9.14 5.38 12 5.38z"
          fill="#EA4335"
        />
      </g>
    </svg>
  );
}
