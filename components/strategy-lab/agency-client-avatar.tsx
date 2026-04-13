'use client';

import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import { cn } from '@/lib/utils/cn';

/**
 * Per-message assistant avatar for Strategy Lab surfaces — a clean round
 * agency mark instead of the generic bot icon. We tried an overlapping
 * "agency × client" lockup here and it read as a dark blob at 32px, so
 * the small avatar is just the agency brand. The empty state renders the
 * wide "Nativz × Client Name" lockup inline instead.
 *
 * The `clientName` / `clientLogoUrl` props are kept so callers don't have
 * to rewire if we re-introduce a combo variant later.
 */

type Size = 'sm' | 'md';

interface Props {
  clientName: string;
  clientLogoUrl?: string | null;
  size?: Size;
  className?: string;
}

const sizeTokens: Record<Size, { tile: string; padding: string }> = {
  sm: { tile: 'h-8 w-8', padding: 'p-1.5' },
  md: { tile: 'h-10 w-10', padding: 'p-2' },
};

export function AgencyClientAvatar({
  size = 'sm',
  className,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientLogoUrl,
}: Props) {
  const { config, brandName } = useAgencyBrand();
  const t = sizeTokens[size];

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-gradient-to-b from-surface to-[#0d0d14] shadow-sm',
        t.tile,
        t.padding,
        className,
      )}
      aria-label={brandName}
      title={brandName}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={config.logoPath}
        alt={brandName}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
