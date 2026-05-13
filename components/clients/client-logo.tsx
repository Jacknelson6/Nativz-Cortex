'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';

/**
 * Universal client logo — perfect circle, real image only.
 *
 * Per PRD B (client avatar overhaul): no colored letter-disc fallback, no
 * rounded-square wrappers. The resolver upstream guarantees `src` is either
 * a real social profile picture, a favicon, or NULL. When NULL or the image
 * fails to load, we render a neutral Building2 icon on bg-surface-muted so
 * the circle is still visible without faking a brand presence.
 */

interface ClientLogoProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  /** When true, drop the subtle border + dark fill behind the logo so it
   *  floats directly on its parent surface. The neutral placeholder still
   *  keeps its tile (otherwise the icon would disappear). */
  noBacking?: boolean;
  /** Legacy prop kept for type compatibility with existing call sites.
   *  The colored letter-disc fallback was removed in PRD B; this value
   *  is intentionally ignored. */
  abbreviation?: string | null;
}

const SIZE_CLASSES: Record<NonNullable<ClientLogoProps['size']>, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
  xl: 'h-24 w-24',
};

const ICON_SIZES: Record<NonNullable<ClientLogoProps['size']>, number> = {
  sm: 14,
  md: 18,
  lg: 24,
  xl: 40,
};

export function ClientLogo({ src, name, size = 'md', className = '', noBacking = false }: ClientLogoProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  const backing = noBacking ? '' : 'border border-white/[0.08] bg-white/[0.04]';

  if (src && !failed) {
    return (
      <div
        className={`shrink-0 overflow-hidden rounded-full flex items-center justify-center ${backing} ${sizeClass} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={`shrink-0 rounded-full flex items-center justify-center bg-white/[0.04] border border-white/[0.08] text-text-muted ${sizeClass} ${className}`}
      aria-label={name}
    >
      <Building2 size={ICON_SIZES[size]} />
    </div>
  );
}
