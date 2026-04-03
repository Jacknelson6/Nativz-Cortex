'use client';

import type { ShootItem } from './types';
import { getAbbr } from './helpers';

export function ShootAvatar({ item, size = 'md', dimmed }: { item: ShootItem; size?: 'sm' | 'md' | 'lg'; dimmed?: boolean }) {
  const sizeClass = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-xs' : 'text-[10px]';

  if (item.clientLogoUrl) {
    return (
      <div className={`relative ${sizeClass} shrink-0 overflow-hidden rounded-lg`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.clientLogoUrl} alt={item.clientName} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-lg ${textSize} font-bold ${dimmed ? 'bg-white/[0.06] text-text-muted' : 'bg-accent-surface text-accent-text'}`}>
      {getAbbr(item)}
    </div>
  );
}
