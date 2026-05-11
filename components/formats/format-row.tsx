'use client';

// VFF-07 T09 + VFF-08 T05: horizontal snap-scroll row with chevron
// buttons (hover-visible, only when >4 cards). Cards are the canonical
// FormatCard (VFF-08); placeholder is gone.

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FormatFeedVideo } from '@/lib/analytics/format-feed';
import { FormatRowEmpty } from './format-row-empty';
import { FormatCard, type ViralVideoCard } from './format-card';

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
            videos.map((v) => <FormatCard key={v.id} video={toCard(v)} />)
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

// Narrow the feed-row shape to the card-only fields. Keeps FormatCard
// reusable outside this surface (e.g. saved-pinned modal) without
// pulling the full FormatFeedVideo type along.
function toCard(v: FormatFeedVideo): ViralVideoCard {
  return {
    id: v.id,
    platform: v.platform,
    source_url: v.source_url,
    thumbnail_storage_url: v.thumbnail_storage_url,
    thumbnail_source_url: v.thumbnail_source_url,
    title: v.title,
    engagement_hook_descriptor: v.engagement_hook_descriptor,
    creator_handle: v.creator_handle,
    views_count: v.views_count,
    posted_at: v.posted_at,
    hook_type_slug: v.hook_type_slug,
    hook_type_label: v.hook_type_label,
    brand_relevance: v.brand_relevance,
  };
}
