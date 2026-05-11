'use client';

// VFF-08 T03: canonical 9:16 thumbnail card.
// Consumes the FormatFeedVideo shape from VFF-07's feed payload.
// Click opens the detail view via Next intercepting modal route at
// `app/admin/formats/@modal/(.)formats/[id]` (stubbed in VFF-08 T07,
// filled by VFF-09).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Platform } from '@/lib/branding/platform-tokens';
import { FormatCardFallback } from './format-card-fallback';

export type ViralVideoCard = {
  id: string;
  platform: Platform;
  source_url: string;
  thumbnail_storage_url: string | null;
  thumbnail_source_url: string | null;
  title: string | null;
  engagement_hook_descriptor: string | null;
  creator_handle: string | null;
  views_count: number | null;
  posted_at: string | null;
  hook_type_slug: string | null;
  hook_type_label: string | null;
  brand_relevance: 'high' | 'medium' | 'low' | null;
};

type Props = {
  video: ViralVideoCard;
  cardWidth?: number;
  onOpen?: (id: string) => void;
};

const RELEVANCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'Strong fit',
  medium: 'Decent fit',
  low: 'Loose fit',
};

// Caption first-line wins if short; else LLM-generated title; else
// the engagement-hook descriptor; else a string we never want to ship
// but is better than a blank tile.
export function resolveTitle(v: ViralVideoCard): string {
  const cap = v.title?.trim() ?? '';
  if (cap && cap.length <= 60) return cap;
  if (cap && cap.length > 60) return cap.slice(0, 57).trim() + '...';
  return v.engagement_hook_descriptor?.trim() || 'Untitled video';
}

export function FormatCard({ video, cardWidth = 176, onOpen }: Props) {
  const router = useRouter();
  const initialThumb = video.thumbnail_storage_url ?? video.thumbnail_source_url ?? null;
  const [thumb, setThumb] = useState<string | null>(initialThumb);

  const handleClick = () => {
    if (onOpen) {
      onOpen(video.id);
      return;
    }
    router.push(`/admin/formats/${video.id}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Open ${video.hook_type_label ?? 'video'} format card`}
      style={{ width: cardWidth }}
      className="group relative block shrink-0 snap-start aspect-[9/16] rounded-md overflow-hidden bg-surface transition-transform duration-150 hover:scale-[1.04] hover:ring-1 hover:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setThumb(null)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <FormatCardFallback platform={video.platform} />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

      {video.hook_type_label ? (
        <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
          {video.hook_type_label}
        </span>
      ) : null}

      <div className="absolute inset-x-2 bottom-2">
        <div className="line-clamp-2 text-sm font-semibold leading-tight text-white">
          {resolveTitle(video)}
        </div>
        {video.engagement_hook_descriptor ? (
          <div className="mt-1 line-clamp-1 text-[11px] text-neutral-200">
            {video.engagement_hook_descriptor}
          </div>
        ) : null}
      </div>

      {video.brand_relevance ? (
        <span className="absolute bottom-2 right-2 hidden rounded-full bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:inline-flex">
          {RELEVANCE_LABEL[video.brand_relevance]}
        </span>
      ) : null}
    </button>
  );
}
