import { Globe, MessageCircleMore, Youtube, Music } from 'lucide-react';
import type { SearchPlatform } from '@/lib/types/search';

export const PLATFORM_CONFIG: Record<
  SearchPlatform,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string; bg: string }
> = {
  web: { label: 'Web & news', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  reddit: { label: 'Reddit', icon: MessageCircleMore, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  youtube: { label: 'YouTube', icon: Youtube, color: 'text-red-400', bg: 'bg-red-400/10' },
  tiktok: { label: 'TikTok', icon: Music, color: 'text-teal-400', bg: 'bg-teal-400/10' },
};

interface PlatformIconProps {
  platform: SearchPlatform;
  size?: number;
  className?: string;
  showLabel?: boolean;
}

export function PlatformIcon({ platform, size = 14, showLabel = false }: PlatformIconProps) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 ${config.color}`}>
      <Icon size={size} />
      {showLabel && <span className="text-xs font-medium">{config.label}</span>}
    </span>
  );
}

export function PlatformBadgeSearch({ platform, size = 'sm' }: { platform: SearchPlatform; size?: 'sm' | 'md' }) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) return null;
  const Icon = config.icon;
  const sizeStyles = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';

  return (
    <span className={`inline-flex items-center justify-center rounded-md ${config.bg} ${sizeStyles}`}>
      <Icon size={size === 'sm' ? 12 : 14} className={config.color} />
    </span>
  );
}
