'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Download,
  FileVideo,
  Image as ImageIcon,
  FileText,
  Loader2,
  Trash2,
  Type,
  UploadCloud,
  File as FileIcon,
  Lock,
} from 'lucide-react';
import { InfoCard } from './info-card';
import { cn } from '@/lib/utils/cn';
import { useConfirm } from '@/components/ui/confirm-dialog';

type AssetSource = 'brand_asset' | 'onboarding_upload';
type Category = 'footage' | 'logo' | 'guideline' | 'photo' | 'font' | 'other';

interface Asset {
  id: string;
  source: AssetSource;
  bucket: 'brand-assets' | 'onboarding-uploads';
  label: string | null;
  category: Category;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  created_at: string;
}

const CATEGORY_META: Record<Category, { label: string; Icon: typeof FileIcon }> = {
  footage: { label: 'Footage', Icon: FileVideo },
  logo: { label: 'Logo', Icon: ImageIcon },
  guideline: { label: 'Guideline', Icon: FileText },
  photo: { label: 'Photo', Icon: ImageIcon },
  font: { label: 'Font', Icon: Type },
  other: { label: 'Other', Icon: FileIcon },
};

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function InfoBrandAssetsCard({ slug }: { slug: string }) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { confirm: confirmDelete, dialog: deleteDialog } = useConfirm({
    title: 'Remove this asset?',
    description: 'The file is permanently deleted from storage.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${slug}/brand-assets`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed to load assets');
      setAssets(body.assets as Asset[]);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load assets');
      setAssets([]);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function uploadFile(file: File) {
    setUploading({ name: file.name, progress: 0 });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/clients/${slug}/brand-assets`, {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Upload failed');
      await refresh();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      await uploadFile(file);
    }
  }

  async function handleDownload(asset: Asset) {
    const qs = new URLSearchParams({ source: asset.source }).toString();
    const res = await fetch(`/api/clients/${slug}/brand-assets/${asset.id}/signed-url?${qs}`);
    const body = await res.json();
    if (res.ok && body.url) {
      window.open(body.url, '_blank', 'noopener');
    } else {
      setLoadError(body.error ?? 'Could not generate download link');
    }
  }

  async function handleDelete(asset: Asset) {
    if (asset.source !== 'brand_asset') return;
    const ok = await confirmDelete();
    if (!ok) return;
    const res = await fetch(`/api/clients/${slug}/brand-assets/${asset.id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setLoadError(body.error ?? 'Delete failed');
      return;
    }
    await refresh();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  return (
    <>
      <InfoCard
        icon={<Archive size={16} />}
        title="Brand assets"
        description="Footage, logos, guidelines, fonts, and reference photos. Surfaced from onboarding uploads plus anything you drop in here."
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={cn(
            'rounded-lg border border-dashed transition-colors',
            'flex flex-col items-center justify-center gap-2 px-4 py-6',
            dragActive
              ? 'border-accent-text/60 bg-accent-surface/40'
              : 'border-nativz-border bg-surface-hover/40',
          )}
        >
          <UploadCloud size={20} className="text-text-muted" />
          <div className="text-sm text-text-secondary text-center">
            Drag and drop files, or{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-accent-text hover:underline font-medium"
            >
              browse
            </button>
            .
          </div>
          <div className="text-xs text-text-muted">Up to 500 MB each. Video, images, PDFs, fonts.</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void uploadFiles(e.target.files);
              }
              e.target.value = '';
            }}
          />
        </div>

        {uploading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={13} className="animate-spin" />
            Uploading {uploading.name}…
          </div>
        )}

        {loadError && (
          <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {loadError}
          </div>
        )}

        <div className="mt-2">
          {assets === null ? (
            <div className="flex items-center gap-2 text-xs text-text-muted py-3">
              <Loader2 size={13} className="animate-spin" /> Loading assets…
            </div>
          ) : assets.length === 0 ? (
            <p className="text-sm italic text-text-muted py-3">No assets yet.</p>
          ) : (
            <ul className="divide-y divide-nativz-border/60">
              {assets.map((asset) => {
                const meta = CATEGORY_META[asset.category] ?? CATEGORY_META.other;
                const Icon = meta.Icon;
                const isOnboarding = asset.source === 'onboarding_upload';
                return (
                  <li
                    key={`${asset.source}:${asset.id}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-hover text-text-secondary">
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm text-text-primary truncate">
                            {asset.label?.trim() || asset.file_name}
                          </p>
                          {isOnboarding && (
                            <span
                              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-accent-surface/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-text"
                              title="Uploaded during onboarding"
                            >
                              Onboarding
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text-muted truncate">
                          {meta.label} · {formatBytes(asset.size_bytes)} · {formatDate(asset.created_at)}
                          {asset.label && asset.file_name && asset.label.trim() !== asset.file_name && (
                            <span> · {asset.file_name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownload(asset)}
                        className="p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface-hover transition-colors"
                        aria-label={`Download ${asset.file_name}`}
                      >
                        <Download size={14} />
                      </button>
                      {isOnboarding ? (
                        <span
                          className="p-1.5 text-text-muted/60 cursor-not-allowed"
                          title="Onboarding uploads are managed in the onboarding tracker"
                        >
                          <Lock size={14} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(asset)}
                          className="p-1.5 text-text-muted hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors"
                          aria-label={`Delete ${asset.file_name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </InfoCard>
      {deleteDialog}
    </>
  );
}
