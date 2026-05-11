'use client';

// VFF-07 T10: hero card at top of /admin/formats.
// Blurred bg + left text block + right 9:16 thumb with hover-autoplay.

import { useRef, useState } from 'react';
import type { FormatFeedVideo } from '@/lib/analytics/format-feed';

type Props = {
  video: FormatFeedVideo;
};

export function FormatHero({ video }: Props) {
  const thumb = video.thumbnail_storage_url ?? video.thumbnail_source_url ?? null;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovering, setHovering] = useState(false);

  const handleEnter = () => {
    setHovering(true);
    const el = videoRef.current;
    if (el) {
      el.currentTime = 0;
      el.play().catch(() => {
        /* autoplay blocked – fall back to thumb */
      });
    }
  };
  const handleLeave = () => {
    setHovering(false);
    const el = videoRef.current;
    if (el) {
      el.pause();
    }
  };

  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/5 bg-surface">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-30 blur-2xl"
        />
      ) : null}
      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
          <div className="space-y-3">
            <span className="text-[11px] uppercase tracking-wider text-accent">
              Featured this morning
            </span>
            <h2 className="text-2xl font-semibold text-white">
              {video.title ?? video.engagement_hook_descriptor ?? 'A standout from your feed'}
            </h2>
            {video.why_it_works ? (
              <p className="max-w-xl text-sm text-white/70">{video.why_it_works}</p>
            ) : null}
          </div>
          <dl className="grid grid-cols-3 gap-4 text-xs">
            <Stat label="Views" value={fmt(video.views_count)} />
            <Stat label="Likes" value={fmt(video.likes_count)} />
            <Stat label="Comments" value={fmt(video.comments_count)} />
          </dl>
          <a
            href={`/admin/formats/${video.id}`}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-xs text-accent transition hover:border-accent hover:bg-accent/20"
          >
            View breakdown
          </a>
        </div>
        <div
          className="relative aspect-[9/16] w-44 shrink-0 overflow-hidden rounded-xl bg-black/40"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className={`h-full w-full object-cover transition-opacity ${hovering ? 'opacity-0' : 'opacity-100'}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-wider text-white/40">
              {video.platform}
            </div>
          )}
          <video
            ref={videoRef}
            src={video.source_url}
            muted
            playsInline
            preload="metadata"
            className={`absolute inset-0 h-full w-full object-cover ${hovering ? 'opacity-100' : 'opacity-0'}`}
          />
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null) return '—';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
