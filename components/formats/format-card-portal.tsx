'use client';

// VFF-10 T18: read-only portal variant of the admin FormatCard. The
// viewer can browse what their team pinned; they cannot pin, dismiss,
// or "Use this format" — those CTAs live in /admin/formats. Click
// opens the portal-side detail page at /portal/research/formats/[id].

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Platform } from '@/lib/branding/platform-tokens';
import { FormatCardFallback } from './format-card-fallback';

export interface PortalFormatCardVideo {
  id: string;
  platform: Platform;
  thumbnail_url: string | null;
  title: string | null;
  engagement_hook_descriptor: string | null;
  creator_handle: string | null;
  views_count: number | null;
  formats: Array<{ slug: string; display_name: string }>;
  client_name: string;
}

function resolveTitle(v: PortalFormatCardVideo): string {
  const cap = v.title?.trim() ?? '';
  if (cap && cap.length <= 60) return cap;
  if (cap.length > 60) return cap.slice(0, 57).trim() + '...';
  return v.engagement_hook_descriptor?.trim() || 'Untitled video';
}

export function FormatCardPortal({
  video,
  cardWidth = 176,
}: {
  video: PortalFormatCardVideo;
  cardWidth?: number;
}) {
  const router = useRouter();
  const [thumb, setThumb] = useState<string | null>(video.thumbnail_url);

  // Primary format tag — first dimension wins; "Pinned" if no tags yet
  // so the card still reads as something rather than a bare thumbnail.
  const primaryTag = video.formats[0]?.display_name ?? 'Pinned reference';

  return (
    <button
      type="button"
      onClick={() => router.push(`/portal/research/formats/${video.id}`)}
      aria-label={`Open ${primaryTag} reference`}
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

      <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
        {primaryTag}
      </span>

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
    </button>
  );
}
