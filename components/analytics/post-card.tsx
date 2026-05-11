'use client';

// ZNA-04: single 9:16 tile in the analytics post grid. Always renders a
// thumbnail (storage / CDN / fallback). Click opens the post in a new tab.
// Footer surfaces platform pill, relative date, headline views, and ER%.

import Image from 'next/image';
import { PlatformFallbackTile } from './platform-fallback-tile';
import { PostSignalDot } from './post-signal-dot';
import type { PostCard as PostCardData, PostGridPlatform } from '@/lib/analytics/posts-query';
import type { PostCardSignal } from '@/lib/analytics/resolve-post-signals';

interface Props {
  post: PostCardData & { signal?: PostCardSignal };
  brandAvatarUrl?: string | null;
}

const PLATFORM_LABEL: Record<PostGridPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
};

const PLATFORM_PILL_CLASS: Record<PostGridPlatform, string> = {
  tiktok: 'bg-pink-500/20 text-pink-200',
  instagram: 'bg-fuchsia-500/20 text-fuchsia-200',
  youtube: 'bg-red-500/20 text-red-200',
  facebook: 'bg-blue-500/20 text-blue-200',
};

const numberFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay >= 30) {
    const months = Math.floor(diffDay / 30);
    return `${months}mo ago`;
  }
  if (diffDay >= 1) return `${diffDay}d ago`;
  if (diffHour >= 1) return `${diffHour}h ago`;
  if (diffMin >= 1) return `${diffMin}m ago`;
  return 'just now';
}

export function PostCard({ post, brandAvatarUrl }: Props) {
  const showImage = post.thumbnail_source !== 'fallback' && post.thumbnail_url;
  const erPretty = post.engagement_rate.toFixed(1);

  const inner = (
    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-lg bg-surface border border-white/5 transition hover:border-white/15 hover:scale-[1.01]">
      {showImage ? (
        <Image
          src={post.thumbnail_url as string}
          alt=""
          fill
          sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 45vw"
          className="object-cover"
          unoptimized={post.thumbnail_source === 'cdn'}
        />
      ) : (
        <PlatformFallbackTile platform={post.platform} brandAvatarUrl={brandAvatarUrl} />
      )}

      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none" />

      <div className="absolute inset-x-2 top-2 flex items-center justify-between">
        <span
          className={`inline-flex h-5 px-2 items-center rounded-full text-[11px] font-medium ${PLATFORM_PILL_CLASS[post.platform]}`}
        >
          {PLATFORM_LABEL[post.platform]}
        </span>
        {post.signal && <PostSignalDot signal={post.signal} />}
      </div>

      <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 text-white">
        <span className="text-xs text-white/70">{relativeDate(post.published_at)}</span>
        <span className="text-sm font-semibold tabular-nums">
          {numberFmt.format(post.views_count)}
          <span className="text-white/60 font-normal"> · {erPretty}% ER</span>
        </span>
      </div>
    </div>
  );

  if (!post.post_url) {
    return <div className="block">{inner}</div>;
  }

  return (
    <a
      href={post.post_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block focus:outline-none focus:ring-2 focus:ring-white/30 rounded-lg"
      title={post.caption?.slice(0, 200) ?? ''}
    >
      {inner}
    </a>
  );
}
