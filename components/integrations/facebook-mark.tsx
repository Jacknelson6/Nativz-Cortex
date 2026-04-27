import { cn } from '@/lib/utils';

/** White “f” for use on Facebook blue tiles / pills. */
const F_ON_BRAND_PATH =
  'M13.397 20.997v-8.196h2.765l.411-3.209h-3.176V7.548c0-.926.258-1.56 1.587-1.56h1.684V3.127A22.336 22.336 0 0014.201 3c-2.444 0-4.122 1.492-4.122 4.231v2.355H7.332v3.209h2.753v8.202h3.312z';

/** Facebook mark: full blue glyph (transparent bg) or white f on brand blue tile. */
export function FacebookMark({
  size = 18,
  className,
  variant = 'full',
}: {
  size?: number;
  className?: string;
  variant?: 'full' | 'onBrand' | 'mono';
}) {
  if (variant === 'mono') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={cn('shrink-0', className)}
        aria-hidden
      >
        <path d={F_ON_BRAND_PATH} fill="currentColor" />
      </svg>
    );
  }

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
        <path d={F_ON_BRAND_PATH} fill="currentColor" />
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
        d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.47h-2.796v8.385C19.612 22.954 24 17.99 24 12z"
        fill="#1877F2"
      />
    </svg>
  );
}
