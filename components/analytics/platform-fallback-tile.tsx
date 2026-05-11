// ZNA-04: deterministic "never broken" fallback tile. Rendered when a post has
// no persisted storage URL AND no Zernio CDN URL (or persistence failed twice).
// Never emits an <img>, so it cannot show the broken-eye placeholder.

import { Music2, Camera, Youtube, Facebook } from 'lucide-react';
import type { PostGridPlatform } from '@/lib/analytics/posts-query';

interface Props {
  platform: PostGridPlatform;
  brandAvatarUrl?: string | null;
}

const PLATFORM_STYLE: Record<
  PostGridPlatform,
  { gradient: string; Icon: typeof Music2; label: string }
> = {
  tiktok: {
    gradient: 'from-pink-500/40 via-zinc-900 to-cyan-500/30',
    Icon: Music2,
    label: 'TikTok',
  },
  instagram: {
    gradient: 'from-fuchsia-500/40 via-zinc-900 to-amber-500/30',
    Icon: Camera,
    label: 'Instagram',
  },
  youtube: {
    gradient: 'from-red-500/40 via-zinc-900 to-zinc-900',
    Icon: Youtube,
    label: 'YouTube',
  },
  facebook: {
    gradient: 'from-blue-500/40 via-zinc-900 to-zinc-900',
    Icon: Facebook,
    label: 'Facebook',
  },
};

export function PlatformFallbackTile({ platform, brandAvatarUrl }: Props) {
  const cfg = PLATFORM_STYLE[platform];
  const Icon = cfg.Icon;
  return (
    <div
      className={`absolute inset-0 bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}
      aria-label={`${cfg.label} post (no thumbnail)`}
    >
      <Icon className="h-10 w-10 text-white/40" strokeWidth={1.5} />
      {brandAvatarUrl ? (
        <div
          className="absolute bottom-2 left-2 h-10 w-10 rounded-full bg-zinc-900 ring-1 ring-white/10 overflow-hidden"
          style={{
            backgroundImage: `url(${brandAvatarUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
