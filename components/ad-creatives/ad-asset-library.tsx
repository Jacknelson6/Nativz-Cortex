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

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const DISPLAY_FONT = 'var(--font-nz-display), system-ui, sans-serif';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  clientId: string;
  initialAssets: AdAsset[];
}

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
    <div className="space-y-7">
      {/* ── Toolbar: editorial filter row + pill upload ─────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <FilterRow
          activeKind={kindFilter}
          counts={counts}
          onSelect={setKindFilter}
        />

        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/70">
            25 MB max
          </span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            {isUploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            {isUploading ? 'Uploading' : 'Upload'}
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
      </div>

      {/* ── Drop zone — flat, typographic, no dashed border ─────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        aria-label="Drop files to upload"
        className={`relative flex items-center justify-between gap-4 rounded-xl px-5 py-4 transition-colors ${
          dragOver
            ? 'bg-accent/10 ring-1 ring-inset ring-accent/40'
            : 'bg-surface/40 ring-1 ring-inset ring-nativz-border/50 hover:ring-nativz-border'
        }`}
      >
        <div className="min-w-0 space-y-1">
          <p className="nz-eyebrow">Drop zone</p>
          <p className="text-sm text-text-muted" style={{ fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 300 }}>
            Drag screenshots, product shots, competitor ads, or PDFs anywhere onto this strip.
          </p>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/60 sm:inline-block">
          {dragOver ? 'Release to upload' : 'or click upload'}
        </span>
      </div>

      {/* ── Asset grid ──────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyAssets
          totalCount={assets.length}
          activeKind={kindFilter}
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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

function FilterRow({
  activeKind,
  counts,
  onSelect,
}: {
  activeKind: AdAssetKind | 'all';
  counts: Record<AdAssetKind | 'all', number>;
  onSelect: (kind: AdAssetKind | 'all') => void;
}) {
  const items: Array<{ value: AdAssetKind | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    ...KIND_ORDER.map((kind) => ({ value: kind, label: KIND_LABELS[kind] })),
  ];

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      {items.map((item, idx) => {
        const isActive = activeKind === item.value;
        const count = counts[item.value];
        const isEmpty = count === 0 && item.value !== 'all';
        return (
          <span key={item.value} className="inline-flex items-baseline gap-x-4">
            {idx > 0 && (
              <span aria-hidden className="text-text-muted/30 text-[13px]">
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => onSelect(item.value)}
              disabled={isEmpty}
              className="group inline-flex items-baseline gap-1.5 transition-colors cursor-pointer disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              <span
                className={`text-[13px] leading-none transition-colors ${
                  isActive
                    ? 'text-text-primary underline decoration-accent decoration-2 underline-offset-[5px]'
                    : isEmpty
                      ? 'text-text-muted/40'
                      : 'text-text-secondary group-hover:text-text-primary'
                }`}
              >
                {item.label}
              </span>
              <span
                className={`font-mono text-[10px] tabular-nums leading-none ${
                  isActive ? 'text-accent-text' : 'text-text-muted/70'
                }`}
              >
                {String(count).padStart(2, '0')}
              </span>
            </button>
          </span>
        );
      })}
    </div>
  );
}

function EmptyAssets({
  totalCount,
  activeKind,
}: {
  totalCount: number;
  activeKind: AdAssetKind | 'all';
}) {
  const headline = totalCount === 0 ? 'Library is empty' : 'No matches in this filter';
  const subhead =
    totalCount === 0
      ? 'Drop in winning ads, product shots, competitor screenshots, and offer briefs. The generator pulls from this library to ground every concept in real brand reference.'
      : `No assets tagged "${activeKind === 'all' ? 'this filter' : KIND_LABELS[activeKind as AdAssetKind]?.toLowerCase()}" yet.`;

  return (
    <div className="space-y-2 py-12">
      <p className="nz-eyebrow">Library</p>
      <h3
        className="text-[22px] leading-tight text-text-primary"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        {headline}
      </h3>
      <p
        className="max-w-xl text-sm text-text-muted leading-relaxed"
        style={{ fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 300 }}
      >
        {subhead}
      </p>
    </div>
  );
}

function AssetCard({ asset, onDelete }: { asset: AdAsset; onDelete: () => void }) {
  const publicUrl = publicAssetUrl(asset.storage_path);
  const isImage = (asset.mime_type ?? '').startsWith('image/');
  const isVideo = (asset.mime_type ?? '').startsWith('video/');
  const isDoc = !isImage && !isVideo;

  return (
    <article className="group flex flex-col gap-2">
      {/* Thumb */}
      <div className="relative overflow-hidden rounded-lg ring-1 ring-nativz-border/60 bg-surface-hover transition-all duration-200 hover:ring-accent/50">
        <div className="aspect-square">
          {isImage ? (
            <Image
              src={publicUrl}
              alt={asset.label}
              width={300}
              height={300}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            />
          ) : isVideo ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
              <Film size={28} />
              <span className="font-mono text-[10px] uppercase tracking-[0.16em]">video</span>
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
              {isDoc ? <FileText size={28} /> : <ImageIcon size={28} />}
              <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                {asset.mime_type?.split('/')[1] ?? 'file'}
              </span>
            </div>
          )}
        </div>

        {/* Delete affordance — circular, opacity-on-hover */}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${asset.label}`}
          title={`Delete ${asset.label}`}
          className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-bg/80 text-text-muted opacity-0 backdrop-blur-sm transition-all hover:bg-nz-coral/90 hover:text-white group-hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Caption */}
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/80">
          {KIND_LABELS[asset.kind]}
        </p>
        <p
          className="truncate text-[13px] text-text-primary leading-tight"
          title={asset.label}
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {asset.label}
        </p>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';
}

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
    return `${origin}/storage/v1/object/public/ad-assets/${storagePath}`;
  } catch {
    return '';
  }
}
