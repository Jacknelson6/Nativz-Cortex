'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';

/**
 * Universal client logo component — Instagram-style circular avatar.
 *
 * - Always a perfect circle that the logo fills edge-to-edge (object-cover)
 * - Subtle backing for transparent logos so the circle is visible
 * - Falls back to a colored initials disc when no image
 * - Consistent sizing via `size` prop: 'sm' (32px), 'md' (40px), 'lg' (56px)
 */

interface ClientLogoProps {
  src?: string | null;
  name: string;
  abbreviation?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** When true, the chip border + dark fill behind a logo image is dropped so
   *  the logo floats directly on its parent surface. Initials fallback still
   *  gets its color tile (otherwise letters disappear). */
  noBacking?: boolean;
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-14 w-14 text-sm',
};

const ICON_SIZES = { sm: 14, md: 18, lg: 24 };

function getInitials(name: string, abbreviation?: string | null): string {
  if (abbreviation) return abbreviation.slice(0, 3);
  return name
    .split(/[\s&]+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Generate a deterministic muted color from name for fallback backgrounds
function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-500/15 text-blue-400',
    'bg-accent2-surface text-accent2-text',
    'bg-emerald-500/15 text-emerald-400',
    'bg-amber-500/15 text-amber-400',
    'bg-rose-500/15 text-rose-400',
    'bg-cyan-500/15 text-cyan-400',
    'bg-indigo-500/15 text-indigo-400',
    'bg-orange-500/15 text-orange-400',
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function ClientLogo({ src, name, abbreviation, size = 'md', className = '', noBacking = false }: ClientLogoProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  const backing = noBacking ? '' : 'border border-white/[0.08] bg-white/[0.04]';

  if (src && !failed) {
    return (
      <div
        className={`shrink-0 overflow-hidden rounded-full flex items-center justify-center ${backing} ${sizeClass} ${className}`}
      >
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback: initials or icon
  const initials = getInitials(name, abbreviation);
  const color = getColor(name);

  return (
    <div
      className={`shrink-0 rounded-full flex items-center justify-center font-bold ${sizeClass} ${color} ${className}`}
    >
      {initials || <Building2 size={ICON_SIZES[size]} />}
    </div>
  );
}
