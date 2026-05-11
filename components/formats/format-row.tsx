'use client';

// VFF-07 T09: horizontal snap-scroll row with chevron buttons (hover).
// Placeholder cards aspect-[9/16] w-44 until VFF-08 replaces with the
// real ThumbnailCard.

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FormatFeedVideo } from '@/lib/analytics/format-feed';
import { FormatRowEmpty } from './format-row-empty';

type Props = {
  label: string;
  videos: FormatFeedVideo[];
};

export function FormatRow({ label, videos }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scroll = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className="group/row relative space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-white/90">{label}</h2>
        <span className="text-[11px] text-white/40">{videos.length}</span>
      </header>
      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {videos.length === 0 ? (
            <FormatRowEmpty />
          ) : (
            videos.map((v) => <PlaceholderCard key={v.id} video={v} />)
          )}
        </div>
        {videos.length > 4 ? (
          <>
            <button
              type="button"
              aria-label={`Scroll ${label} left`}
              onClick={() => scroll(-1)}
              className="absolute left-0 top-1/2 hidden h-10 w-7 -translate-y-1/2 items-center justify-center rounded-r-md bg-black/60 text-white/80 backdrop-blur transition hover:bg-black/80 group-hover/row:flex"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${label} right`}
              onClick={() => scroll(1)}
              className="absolute right-0 top-1/2 hidden h-10 w-7 -translate-y-1/2 items-center justify-center rounded-l-md bg-black/60 text-white/80 backdrop-blur transition hover:bg-black/80 group-hover/row:flex"
            >
              <ChevronRight size={16} />
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

function PlaceholderCard({ video }: { video: FormatFeedVideo }) {
  const thumb = video.thumbnail_storage_url ?? video.thumbnail_source_url ?? null;
  const views = video.views_count;
  const formatted = views == null ? '—' : views < 1000 ? String(views) : views < 1_000_000 ? `${(views / 1000).toFixed(1)}K` : `${(views / 1_000_000).toFixed(1)}M`;
  return (
    <a
      href={`/admin/formats/${video.id}`}
      className="group/card relative aspect-[9/16] w-44 shrink-0 snap-start overflow-hidden rounded-xl bg-surface/40"
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition group-hover/card:scale-[1.03]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-wider text-white/40">
          {video.platform}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-2 pt-6 text-[11px] text-white/90">
        <div className="truncate">{video.creator_handle ?? '—'}</div>
        <div className="text-white/60">{formatted} views</div>
      </div>
    </a>
  );
}
