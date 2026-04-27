'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { ExternalLink, Search } from 'lucide-react';

export interface ReferenceAdRow {
  id: string;
  source_file_name: string;
  source_folder_name: string | null;
  source_url: string;
  image_url: string | null;
  category: string | null;
  tags: string[] | null;
}

interface Props {
  initialReferenceAds: ReferenceAdRow[];
}

const DISPLAY_FONT = 'var(--font-nz-display), system-ui, sans-serif';

/**
 * Read-only browse pane for the reference-ads library — every image
 * pulled in from the shared Google Drive folder via the nightly sync.
 * Grouped by source folder so admins can scan what categories the
 * generator has to draw from. Each thumbnail links back to Drive.
 */
export function AdReferenceLibrary({ initialReferenceAds }: Props) {
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const map = new Map<string, ReferenceAdRow[]>();
    for (const ad of initialReferenceAds) {
      if (needle) {
        const haystack = [
          ad.source_folder_name ?? '',
          ad.source_file_name,
          ad.category ?? '',
          ...(ad.tags ?? []),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      const folder = ad.source_folder_name ?? ad.category ?? 'Uncategorised';
      const bucket = map.get(folder) ?? [];
      bucket.push(ad);
      map.set(folder, bucket);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [initialReferenceAds, query]);

  const total = initialReferenceAds.length;
  const visible = grouped.reduce((acc, [, ads]) => acc + ads.length, 0);

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center">
        <div className="max-w-md space-y-3">
          <p className="text-[14px] text-text-secondary">
            No reference ads synced yet. Run{' '}
            <code className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-[11px] text-text-primary">
              npx tsx scripts/sync-reference-ads.ts
            </code>{' '}
            to pull the shared Google Drive folder into Cortex.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Synced from Google Drive
          </p>
          <p className="text-[12px] text-text-secondary">
            {visible.toLocaleString()}{' '}
            {query ? `match${visible === 1 ? '' : 'es'} of ${total.toLocaleString()}` : `ad${total === 1 ? '' : 's'}`}
            {' '}across {grouped.length} folder{grouped.length === 1 ? '' : 's'}.
          </p>
        </div>
        <label className="relative">
          <span className="sr-only">Search reference ads</span>
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search folder, filename, tag…"
            className="h-8 w-56 rounded-full border border-nativz-border bg-surface pl-7 pr-3 text-[12px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      {grouped.map(([folder, ads]) => (
        <section key={folder} className="space-y-2">
          <header className="flex items-baseline justify-between gap-3">
            <h3
              className="text-[13px] font-semibold text-text-primary"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              {folder}
            </h3>
            <span className="font-mono text-[10px] tabular-nums text-text-muted">
              {String(ads.length).padStart(2, '0')}
            </span>
          </header>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {ads.map((ad) => (
              <ReferenceAdThumb key={ad.id} ad={ad} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReferenceAdThumb({ ad }: { ad: ReferenceAdRow }) {
  return (
    <a
      href={ad.source_url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${ad.source_folder_name ?? ''} / ${ad.source_file_name}`}
      className="group relative block overflow-hidden rounded-lg border border-nativz-border bg-surface transition-colors hover:border-accent/50"
    >
      <div className="relative aspect-square w-full bg-surface-hover">
        {ad.image_url ? (
          <Image
            src={ad.image_url}
            alt={ad.source_file_name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-text-muted">
            no preview
          </div>
        )}
        <span className="pointer-events-none absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ExternalLink size={10} />
        </span>
      </div>
    </a>
  );
}
