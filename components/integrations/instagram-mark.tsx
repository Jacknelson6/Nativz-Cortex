'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Instagram: gradient glyph on transparent, or white outline camera on gradient tile. */
export function InstagramMark({
  size = 18,
  className,
  variant = 'full',
}: {
  size?: number;
  className?: string;
  variant?: 'full' | 'onBrand';
}) {
  if (variant === 'onBrand') {
    const sw = size >= 16 ? 1.75 : 1.35;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={cn('shrink-0 text-white', className)}
        aria-hidden
      >
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth={sw} />
        <circle cx="12" cy="12" r="3.35" stroke="currentColor" strokeWidth={sw} />
        <circle cx="17.2" cy="6.8" r="0.95" fill="currentColor" />
      </svg>
    );
  }

  const gradId = `ig-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDC830" />
          <stop offset="0.45" stopColor="#F37335" />
          <stop offset="1" stopColor="#C13584" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M12 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8z"
        fill={`url(#${gradId})`}
      />
      <circle cx="18.406" cy="5.594" r="1.44" fill={`url(#${gradId})`} />
    </svg>
  );
}
