'use client';

import type { SocialPlatform } from '@/lib/types/reporting';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { InstagramMark } from '@/components/integrations/instagram-mark';
import { FacebookMark } from '@/components/integrations/facebook-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';

const BADGE_SOCIAL_TILE_DARK = 'bg-black/65 ring-1 ring-white/12';
const BADGE_SOCIAL_TILE_FB = 'bg-[#1877F2] ring-1 ring-black/15';
const BADGE_SOCIAL_TILE_YT = 'bg-[#FF0300] ring-1 ring-black/15';
const BADGE_SOCIAL_TILE_IG =
  'bg-gradient-to-r from-[#FDC830] via-[#F37335] to-[#C13584] ring-1 ring-black/15';
const BADGE_SOCIAL_TILE_LI = 'bg-[#0A66C2] ring-1 ring-black/15';

const platformConfig: Record<
  SocialPlatform,
  { color: string; bg: string; label: string; icon: React.ReactNode }
> = {
  instagram: {
    color: 'text-white',
    bg: BADGE_SOCIAL_TILE_IG,
    label: 'Instagram',
    icon: <InstagramMark variant="onBrand" size={12} />,
  },
  facebook: {
    color: 'text-white',
    bg: BADGE_SOCIAL_TILE_FB,
    label: 'Facebook',
    icon: <FacebookMark variant="onBrand" size={12} />,
  },
  tiktok: {
    color: 'text-text-primary',
    bg: BADGE_SOCIAL_TILE_DARK,
    label: 'TikTok',
    icon: <TikTokMark size={12} />,
  },
  youtube: {
    color: 'text-white',
    bg: BADGE_SOCIAL_TILE_YT,
    label: 'YouTube',
    icon: <YouTubeMark variant="onBrand" size={12} />,
  },
  linkedin: {
    color: 'text-white',
    bg: BADGE_SOCIAL_TILE_LI,
    label: 'LinkedIn',
    icon: <span className="text-[10px] font-bold">in</span>,
  },
  googlebusiness: {
    color: 'text-white',
    bg: 'bg-[#4285F4] ring-1 ring-black/15',
    label: 'Google Business',
    icon: <span className="text-[10px] font-bold">G</span>,
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
