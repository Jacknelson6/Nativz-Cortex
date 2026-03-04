'use client';

import { Instagram, Facebook, Youtube } from 'lucide-react';
import type { SocialPlatform } from '@/lib/types/reporting';

const platformConfig: Record<
  SocialPlatform,
  { color: string; bg: string; label: string; icon: React.ReactNode }
> = {
  instagram: {
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
    label: 'Instagram',
    icon: <Instagram size={14} />,
  },
  facebook: {
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    label: 'Facebook',
    icon: <Facebook size={14} />,
  },
  tiktok: {
    color: 'text-teal-400',
    bg: 'bg-teal-400/10',
    label: 'TikTok',
    icon: <span className="text-[10px] font-bold leading-none">TT</span>,
  },
  youtube: {
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    label: 'YouTube',
    icon: <Youtube size={14} />,
  },
};

interface PlatformBadgeProps {
  platform: SocialPlatform;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function PlatformBadge({
  platform,
  showLabel = true,
  size = 'md',
}: PlatformBadgeProps) {
  const config = platformConfig[platform];
  if (!config) return null;

  const sizeStyles = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.color} ${config.bg} ${sizeStyles}`}
    >
      {config.icon}
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
