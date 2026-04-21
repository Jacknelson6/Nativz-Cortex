'use client';

import { Sparkles } from 'lucide-react';
import { useAgencyBrand } from '@/lib/agency/use-agency-brand';
import { cn } from '@/lib/utils/cn';

/**
 * Per-message assistant avatar for Strategy Lab. Earlier attempts to
 * crush the agency lockup or an "agency × client" combo into a 32px
 * tile read as an unreadable blob. The Nerd needs its own mark — a
 * sparkles glyph in the agency accent color, on a tinted accent tile.
 * Recognizable as "AI assistant" while staying brand-tinted.
 *
 * The `clientName` / `clientLogoUrl` props are kept so callers don't
 * have to rewire if we re-introduce a combo variant later.
 */

type Size = 'sm' | 'md';

interface Props {
  clientName: string;
  clientLogoUrl?: string | null;
  size?: Size;
  className?: string;
}

const sizeTokens: Record<Size, { tile: string; icon: number }> = {
  sm: { tile: 'h-8 w-8', icon: 16 },
  md: { tile: 'h-10 w-10', icon: 20 },
};

export function AgencyClientAvatar({
  size = 'sm',
  className,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientName,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clientLogoUrl,
}: Props) {
  const { brandName } = useAgencyBrand();
  const t = sizeTokens[size];

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/[0.08] shadow-sm',
        t.tile,
        className,
      )}
      role="img"
      aria-label={`The Nerd · ${brandName}`}
      title={`The Nerd · ${brandName}`}
    >
      <Sparkles size={t.icon} className="text-accent-text" aria-hidden />
    </div>
  );
}
