import { Globe } from 'lucide-react';
import type { SearchPlatform } from '@/lib/types/search';
import { cn } from '@/lib/utils';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';

function YouTubePlatformIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function TikTokLogo({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

// ── Brand SVG icons ──────────────────────────────────────────────────────────

function RedditLogo({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z" />
    </svg>
  );
}

export const PLATFORM_CONFIG: Record<
  SearchPlatform,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string; bg: string }
> = {
  web: { label: 'Web', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  reddit: { label: 'Reddit', icon: RedditLogo, color: 'text-[#FF4500]', bg: 'bg-[#FF4500]/10' },
  youtube: { label: 'YouTube', icon: YouTubePlatformIcon, color: 'text-[#FF0000]', bg: 'bg-[#FF0000]/10' },
  tiktok: { label: 'TikTok', icon: TikTokLogo, color: 'text-text-primary', bg: 'bg-white/10' },
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
  const sizeStyles = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  const iconSize = size === 'sm' ? 14 : 16;

  /** Full YouTube mark (red tile + play in one SVG) — avoids a chunky red box + separate play icon. */
  if (platform === 'youtube') {
    const yt = size === 'sm' ? 20 : 24;
    return (
      <span className="inline-flex shrink-0 items-center justify-center" aria-hidden>
        <YouTubeMark variant="full" size={yt} />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center justify-center rounded-md ${config.bg} ${sizeStyles}`}>
      <Icon size={iconSize} className={config.color} />
    </span>
  );
}
