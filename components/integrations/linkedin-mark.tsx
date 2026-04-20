import { cn } from '@/lib/utils';

/** LinkedIn: white "in" glyph on brand blue tile, or full blue glyph on transparent. */
export function LinkedInMark({
  size = 18,
  className,
  variant = 'full',
}: {
  size?: number;
  className?: string;
  variant?: 'full' | 'onBrand';
}) {
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
          d="M6.94 8.5H3.56v11.92h3.38V8.5zM5.25 3.1a1.96 1.96 0 100 3.92 1.96 1.96 0 000-3.92zM20.44 20.42v-6.53c0-3.5-1.87-5.12-4.36-5.12-2.01 0-2.91 1.11-3.41 1.88V8.5H9.29c.04.95 0 11.92 0 11.92h3.38v-6.66c0-.3.02-.61.11-.82.24-.6.8-1.23 1.72-1.23 1.22 0 1.71.93 1.71 2.28v6.43h3.23z"
          fill="currentColor"
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
      <path
        d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05a3.74 3.74 0 013.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zm1.78 13.02H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .77 0 1.72v20.56C0 23.23.8 24 1.77 24h20.45C23.2 24 24 23.23 24 22.28V1.72C24 .77 23.2 0 22.22 0z"
        fill="#0A66C2"
      />
    </svg>
  );
}
