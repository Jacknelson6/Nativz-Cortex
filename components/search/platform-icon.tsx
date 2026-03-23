import { Globe } from 'lucide-react';
import type { SearchPlatform } from '@/lib/types/search';
import { cn } from '@/lib/utils';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';

function YouTubeSearchMark({
  size,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <YouTubeMark variant="onBrand" size={size} className={cn('text-white', className)} />
  );
}

// ── Brand SVG icons ──────────────────────────────────────────────────────────

function RedditLogo({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  );
}

function QuoraLogo({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.73 19.35c-.84-1.35-1.83-2.67-3.21-2.67-.46 0-.92.15-1.27.56l-.78-.85c.63-.86 1.58-1.38 2.81-1.38 1.84 0 2.98 1.05 3.91 2.34.6-1.18.91-2.68.91-4.43 0-5.14-2.09-8.27-5.1-8.27S4.9 7.78 4.9 12.92c0 5.12 2.09 8.2 5.1 8.2.96 0 1.83-.32 2.57-.97l.16.2zM10 24C4.48 24 0 18.63 0 12.92S4.48 1.85 10 1.85s10 5.37 10 11.07c0 2.69-.76 5.12-2.04 7.03.58.81 1.22 1.33 2.04 1.33.58 0 1.05-.22 1.37-.48l.66 1.35c-.67.6-1.56.85-2.53.85-1.74 0-3.02-1.05-3.92-2.5C14.22 22.33 12.21 24 10 24z" />
    </svg>
  );
}

export const PLATFORM_CONFIG: Record<
  SearchPlatform,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string; bg: string }
> = {
  web: { label: 'Web', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  reddit: { label: 'Reddit', icon: RedditLogo, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  youtube: {
    label: 'YouTube',
    icon: YouTubeSearchMark,
    color: 'text-white',
    bg: 'bg-[#FF0300] ring-1 ring-black/20',
  },
  tiktok: { label: 'TikTok', icon: TikTokMark, color: 'text-text-primary', bg: 'bg-black/65 ring-1 ring-white/12' },
  quora: { label: 'Quora', icon: QuoraLogo, color: 'text-red-500', bg: 'bg-red-500/10' },
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
