'use client';

// ZNA-04: filter + sort header above the post grid. Platform multi-select +
// sort dropdown. Stays compact so the grid below has the spotlight.

import type { PostGridPlatform, PostGridSort } from '@/lib/analytics/posts-query';

interface Props {
  platforms: PostGridPlatform[];
  selectedPlatforms: PostGridPlatform[];
  onPlatformChange: (next: PostGridPlatform[]) => void;
  sort: PostGridSort;
  onSortChange: (next: PostGridSort) => void;
  aboveAvgOnly: boolean;
  onAboveAvgOnlyChange: (next: boolean) => void;
}

const PLATFORM_LABEL: Record<PostGridPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
};

const SORT_LABEL: Record<PostGridSort, string> = {
  published_at: 'Newest first',
  views_count: 'Most views',
  engagement_rate: 'Highest engagement',
};

export function PostGridFilterBar({
  platforms,
  selectedPlatforms,
  onPlatformChange,
  sort,
  onSortChange,
  aboveAvgOnly,
  onAboveAvgOnlyChange,
}: Props) {
  const togglePlatform = (p: PostGridPlatform) => {
    if (selectedPlatforms.includes(p)) {
      const next = selectedPlatforms.filter((x) => x !== p);
      onPlatformChange(next);
    } else {
      onPlatformChange([...selectedPlatforms, p]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {platforms.map((p) => {
          const active = selectedPlatforms.includes(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`inline-flex h-7 px-3 items-center rounded-full text-xs font-medium whitespace-nowrap transition ${
                active
                  ? 'bg-white text-zinc-900'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {PLATFORM_LABEL[p]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onAboveAvgOnlyChange(!aboveAvgOnly)}
        className={`inline-flex h-7 px-3 items-center rounded-full text-xs font-medium whitespace-nowrap transition ${
          aboveAvgOnly
            ? 'bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/40'
            : 'bg-white/5 text-white/70 hover:bg-white/10'
        }`}
        aria-pressed={aboveAvgOnly}
      >
        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${aboveAvgOnly ? 'bg-emerald-300' : 'bg-emerald-400/50'}`} />
        Above average only
      </button>

      <div className="ml-auto">
        <label className="sr-only" htmlFor="post-grid-sort">
          Sort
        </label>
        <select
          id="post-grid-sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as PostGridSort)}
          className="h-7 rounded-full bg-white/5 text-xs px-3 text-white/80 hover:bg-white/10 outline-none border border-white/10"
        >
          {(Object.keys(SORT_LABEL) as PostGridSort[]).map((k) => (
            <option key={k} value={k} className="bg-zinc-900">
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {selectedPlatforms.length === 0 ? (
        <div className="basis-full text-xs text-amber-300/80">Pick at least one platform.</div>
      ) : null}
    </div>
  );
}
