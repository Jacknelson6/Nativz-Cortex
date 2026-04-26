import { cn } from '@/lib/utils';

/** TikTok app-style note: cyan + splash-pink offsets, white foreground (no wordmark). */
const NOTE_PATH =
  'M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.18 8.18 0 004.77 1.52V6.84a4.84 4.84 0 01-1-.15z';

export function TikTokMark({
  size = 18,
  className,
  variant = 'auto',
}: {
  size?: number;
  className?: string;
  /** 'auto' uses currentColor for the foreground so it adapts to light/dark brand modes automatically.
   *  'onLight' forces a solid black mark (strips the chromatic split — cleaner at small sizes on white).
   *  'onDark' forces a solid white foreground with the chromatic cyan/pink split.
   *  'mono' renders the note path in currentColor only — no chromatic split, no
   *  hard-coded color — so it can sit alongside lucide brand icons at the same
   *  visual weight in muted/secondary text contexts. */
  variant?: 'auto' | 'onDark' | 'onLight' | 'mono';
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
        <path d={NOTE_PATH} fill="currentColor" />
      </svg>
    );
  }
  if (variant === 'onLight') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={cn('shrink-0', className)}
        aria-hidden
      >
        <path d={NOTE_PATH} fill="#000000" />
      </svg>
    );
  }
  const fg = variant === 'onDark' ? '#FFFFFF' : 'currentColor';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <path d={NOTE_PATH} fill="#00F2EA" transform="translate(-0.55 -0.55)" />
      <path d={NOTE_PATH} fill="#FE2C55" transform="translate(0.55 0.55)" />
      <path d={NOTE_PATH} fill={fg} />
    </svg>
  );
}
