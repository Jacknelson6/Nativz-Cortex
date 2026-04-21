'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Upload, FileText, Film, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseUrl } from '@/lib/supabase/public-env';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdAssetKind =
  | 'winning-ad'
  | 'product-shot'
  | 'competitor'
  | 'logo-alt'
  | 'offer-brief'
  | 'review-screenshot'
  | 'other';

export interface AdAsset {
  id: string;
  kind: AdAssetKind;
  label: string;
  notes: string | null;
  storage_path: string;
  mime_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  tags: string[];
  created_at: string;
}

// Kind presentation — ordered so the UI filter reads naturally top-to-bottom.
const KIND_LABELS: Record<AdAssetKind, string> = {
  'winning-ad': 'Winning ads',
  'product-shot': 'Product shots',
  competitor: 'Competitors',
  'logo-alt': 'Alt logos',
  'offer-brief': 'Offer briefs',
  'review-screenshot': 'Review screenshots',
  other: 'Other',
};

const KIND_ORDER: AdAssetKind[] = [
  'winning-ad',
  'product-shot',
  'competitor',
  'logo-alt',
  'offer-brief',
  'review-screenshot',
  'other',
];

// 25 MB per file keeps us well under Supabase's 50 MB Storage default while
// still covering hi-res ad screenshots and short MP4 captures.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  clientId: string;
  initialAssets: AdAsset[];
}

/**
 * Per-client asset library. Admins drop files in, the server writes them to
 * the `ad-assets` bucket and an `ad_assets` row, and the grid below re-renders
 * from that list. Phase 2 generators read from this list and attach relevant
 * rows (by kind + tags) to each concept for source grounding.
 */
export function AdAssetLibrary({ clientId, initialAssets }: Props) {
  const [assets, setAssets] = useState<AdAsset[]>(initialAssets);
  const [kindFilter, setKindFilter] = useState<AdAssetKind | 'all'>('all');
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (kindFilter === 'all') return assets;
    return assets.filter((a) => a.kind === kindFilter);
  }, [assets, kindFilter]);

  const counts = useMemo(() => {
    const map: Record<AdAssetKind | 'all', number> = {
      all: assets.length,
      'winning-ad': 0,
      'product-shot': 0,
      competitor: 0,
      'logo-alt': 0,
      'offer-brief': 0,
      'review-screenshot': 0,
      other: 0,
    };
    for (const a of assets) map[a.kind] += 1;
    return map;
  }, [assets]);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      // Enforce the per-file size ceiling client-side so we don't
      // round-trip to the server just to get a 413 back.
      const oversized = list.filter((f) => f.size > MAX_UPLOAD_BYTES);
      if (oversized.length > 0) {
        toast.error(
          `${oversized.length} file${oversized.length === 1 ? '' : 's'} exceed the 25 MB limit and were skipped.`,
        );
      }

      const eligible = list.filter((f) => f.size <= MAX_UPLOAD_BYTES);
      if (eligible.length === 0) return;

      setIsUploading(true);
      try {
        const uploaded: AdAsset[] = [];
        for (const file of eligible) {
          const form = new FormData();
          form.append('file', file);
          form.append('clientId', clientId);
          // Default kind is inferred from filename heuristics server-side;
          // admins can reclassify via the row menu after upload.
          form.append('kind', guessKindFromFilename(file.name));
          form.append('label', stripExtension(file.name));

          const res = await fetch('/api/ad-assets', {
            method: 'POST',
            body: form,
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            toast.error(`Failed to upload ${file.name}: ${body?.error ?? res.statusText}`);
            continue;
          }
          const { asset } = (await res.json()) as { asset: AdAsset };
          uploaded.push(asset);
        }
        if (uploaded.length > 0) {
          setAssets((prev) => [...uploaded, ...prev]);
          toast.success(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? '' : 's'}`);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [clientId],
  );

  const handleDelete = useCallback(async (id: string) => {
    const asset = assets.find((a) => a.id === id);
    if (!asset) return;
    // Optimistic removal — restore on failure.
    setAssets((prev) => prev.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/ad-assets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
    } catch {
      setAssets((prev) =>
        [...prev, asset].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
      toast.error('Could not delete asset');
    }
  }, [assets]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length === 0) return;
      void handleUpload(e.dataTransfer.files);
    },
    [handleUpload],
  );

  return (
    <div className="space-y-5">
      {/* Upload + filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          <FilterChip
            label={`All · ${counts.all}`}
            active={kindFilter === 'all'}
            onClick={() => setKindFilter('all')}
          />
          {KIND_ORDER.map((kind) => (
            <FilterChip
              key={kind}
              label={`${KIND_LABELS[kind]} · ${counts[kind]}`}
              active={kindFilter === kind}
              onClick={() => setKindFilter(kind)}
              dim={counts[kind] === 0}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Upload files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleUpload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Drop zone — always visible so users can drag anywhere on the page */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? 'border-accent-text bg-accent-surface/20'
            : 'border-nativz-border bg-surface/30'
        }`}
      >
        <p className="text-sm text-text-muted">
          Drop files here — screenshots, product shots, competitor ads, PDFs. 25 MB max per file.
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
          <p className="text-sm text-text-muted">
            {assets.length === 0
              ? 'No assets uploaded yet. Drop files above to start your library.'
              : `No ${KIND_LABELS[kindFilter as AdAssetKind]?.toLowerCase() ?? 'assets'} yet.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onDelete={() => void handleDelete(asset.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function FilterChip({
  label,
  active,
  onClick,
  dim,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-accent-surface text-accent-text'
          : dim
            ? 'text-text-muted/50 hover:bg-surface-hover hover:text-text-muted'
            : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}

function AssetCard({ asset, onDelete }: { asset: AdAsset; onDelete: () => void }) {
  const publicUrl = publicAssetUrl(asset.storage_path);
  const isImage = (asset.mime_type ?? '').startsWith('image/');
  const isVideo = (asset.mime_type ?? '').startsWith('video/');
  const isDoc = !isImage && !isVideo;

  return (
    <div className="group relative overflow-hidden rounded-lg border border-nativz-border bg-surface">
      <div className="aspect-square bg-surface-hover">
        {isImage ? (
          // Client brand asset — the `**` remotePattern allowlist covers
          // arbitrary Supabase storage origins, so Next/Image optimizes
          // these automatically.
          <Image
            src={publicUrl}
            alt={asset.label}
            width={300}
            height={300}
            className="h-full w-full object-cover"
          />
        ) : isVideo ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            <Film size={28} />
            <span className="text-[10px]">video</span>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            {isDoc ? <FileText size={28} /> : <ImageIcon size={28} />}
            <span className="text-[10px]">
              {asset.mime_type?.split('/')[1] ?? 'file'}
            </span>
          </div>
        )}
      </div>
      <div className="space-y-0.5 p-2">
        <p className="truncate text-[12px] font-medium text-text-primary" title={asset.label}>
          {asset.label}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-text-muted/70">
          {KIND_LABELS[asset.kind]}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${asset.label}`}
        title={`Delete ${asset.label}`}
        className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-surface/90 text-text-muted opacity-0 shadow-sm transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';
}

// Cheap filename heuristic so uploads land in a sensible bucket on day one.
// The row menu lets admins reclassify — this is just a first-pass guess.
function guessKindFromFilename(name: string): AdAssetKind {
  const lower = name.toLowerCase();
  if (/(?:winning|top|hero|winner)/.test(lower)) return 'winning-ad';
  if (/(?:competitor|competitive|rival)/.test(lower)) return 'competitor';
  if (/(?:product|shot|hero-shot)/.test(lower)) return 'product-shot';
  if (/(?:logo|mark|wordmark)/.test(lower)) return 'logo-alt';
  if (/(?:offer|promo|deal|brief)/.test(lower)) return 'offer-brief';
  if (/(?:review|testimonial|5.?star|star.?rating)/.test(lower)) return 'review-screenshot';
  return 'other';
}

function publicAssetUrl(storagePath: string): string {
  try {
    const origin = new URL(getSupabaseUrl()).origin;
    // Bucket is public (see migration 132_ad_assets.sql) — no signed URL needed.
    return `${origin}/storage/v1/object/public/ad-assets/${storagePath}`;
  } catch {
    return '';
  }
}

