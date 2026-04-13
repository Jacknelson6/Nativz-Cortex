'use client';

import { ClientLogo } from '@/components/clients/client-logo';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import { cn } from '@/lib/utils/cn';

/**
 * Compact "Agency × Client" avatar used in Strategy Lab surfaces in place of
 * the generic bot icon. Two overlapping rounded tiles — agency mark behind,
 * client logo slightly forward — so the reader sees a single glyph that
 * reads as "Nativz × Avondale" from across the room.
 *
 * Size variants:
 *   sm  → 32px (message avatar)
 *   md  → 40px (header badges)
 *   lg  → 56px (empty state)
 */

type Size = 'sm' | 'md' | 'lg';

interface Props {
  clientName: string;
  clientLogoUrl?: string | null;
  size?: Size;
  className?: string;
}

const sizeTokens: Record<Size, { tile: string; logoInset: string; border: string; gap: string }> = {
  sm: { tile: 'h-8 w-8', logoInset: 'h-6 w-6', border: 'border', gap: '-ml-2.5' },
  md: { tile: 'h-10 w-10', logoInset: 'h-7 w-7', border: 'border', gap: '-ml-3' },
  lg: { tile: 'h-14 w-14', logoInset: 'h-10 w-10', border: 'border', gap: '-ml-4' },
};

export function AgencyClientAvatar({ clientName, clientLogoUrl, size = 'sm', className }: Props) {
  const { config, brandName } = useAgencyBrand();
  const t = sizeTokens[size];

  return (
    <div className={cn('flex shrink-0 items-center', className)}>
      {/* Agency mark tile */}
      <div
        className={cn(
          'flex items-center justify-center rounded-xl bg-surface/80 p-1 shadow-sm',
          t.tile,
          t.border,
          'border-nativz-border/60',
        )}
        aria-label={brandName}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.logoPath}
          alt={brandName}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      {/* Client logo tile, overlapping to imply collab */}
      <ClientLogo
        src={clientLogoUrl ?? null}
        name={clientName}
        size={size === 'lg' ? 'lg' : 'sm'}
        className={cn(
          '!rounded-xl bg-surface/90 shadow-sm ring-1 ring-nativz-border/60',
          t.tile,
          t.gap,
        )}
      />
    </div>
  );
}
