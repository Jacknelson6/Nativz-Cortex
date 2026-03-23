import { cn } from '@/lib/utils';

const PLAY_PATH = 'M9.545 15.568V8.432L15.818 12l-6.273 3.568z';

/** YouTube: full red tile + play, or white play only on red brand background. */
export function YouTubeMark({
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
        <path d={PLAY_PATH} fill="currentColor" />
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
        d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
        fill="#FF0000"
      />
      <path d={PLAY_PATH} fill="#FFFFFF" />
    </svg>
  );
}
