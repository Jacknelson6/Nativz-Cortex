'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';

/**
 * Universal client logo component.
 *
 * Normalizes logos to feel unified regardless of original format:
 * - Consistent rounded square container with subtle border
 * - Dark neutral background that works with both light and dark logos
 * - `object-contain` with padding so logos breathe
 * - Fallback to abbreviation or icon when no logo exists
 * - Consistent sizing via `size` prop: 'sm' (32px), 'md' (40px), 'lg' (56px)
 */

interface ClientLogoProps {
  src?: string | null;
  name: string;
  abbreviation?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 rounded-lg text-[10px]',
  md: 'h-10 w-10 rounded-xl text-xs',
  lg: 'h-14 w-14 rounded-2xl text-sm',
};

const ICON_SIZES = { sm: 14, md: 18, lg: 24 };
const PADDING = { sm: 'p-1', md: 'p-1.5', lg: 'p-2' };

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
    'bg-purple-500/15 text-purple-400',
    'bg-emerald-500/15 text-emerald-400',
    'bg-amber-500/15 text-amber-400',
    'bg-rose-500/15 text-rose-400',
    'bg-cyan-500/15 text-cyan-400',
    'bg-indigo-500/15 text-indigo-400',
    'bg-orange-500/15 text-orange-400',
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function ClientLogo({ src, name, abbreviation, size = 'md', className = '' }: ClientLogoProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  const pad = PADDING[size];

  if (src && !failed) {
    return (
      <div
        className={`shrink-0 overflow-hidden border border-white/[0.08] bg-white/[0.04] flex items-center justify-center ${sizeClass} ${pad} ${className}`}
      >
        <img
          src={src}
          alt={name}
          className="h-full w-full object-contain"
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
      className={`shrink-0 flex items-center justify-center font-bold ${sizeClass} ${color} ${className}`}
    >
      {initials || <Building2 size={ICON_SIZES[size]} />}
    </div>
  );
}
