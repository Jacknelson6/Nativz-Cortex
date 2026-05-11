// SPY-09 T11: opening panel. Big brand name, prepared-for date, both
// logos. Designed to fill a 1920x1080 Zoom share without crowding.

import type { PresentationCover } from '@/lib/prospects/types';

interface Props {
  cover: PresentationCover;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function PanelCover({ cover }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-12 text-center">
      <div className="text-base uppercase tracking-[0.3em] text-zinc-400">
        Prepared for
      </div>
      <div className="mt-6 flex items-center gap-6">
        {cover.brand_logo_url ? (
          // Prospect avatar lives on Storage / Apify; treat as a thumbnail,
          // not a logo. Keeping it modest avoids breaking the typography.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.brand_logo_url}
            alt={`${cover.brand_name} logo`}
            className="h-20 w-20 rounded-full border border-zinc-700 object-cover"
          />
        ) : null}
        <h1 className="text-[72px] font-semibold leading-tight text-white">
          {cover.brand_name}
        </h1>
      </div>
      <div className="mt-10 text-2xl text-zinc-300">
        Short-form video opportunity review
      </div>
      <div className="mt-3 text-base text-zinc-500">
        {formatDate(cover.prepared_for_date)}
      </div>
      <div className="absolute bottom-10 text-sm uppercase tracking-[0.25em] text-zinc-500">
        Powered by Nativz
      </div>
    </div>
  );
}
