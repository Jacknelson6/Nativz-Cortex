'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Upload, X, Film, Filter, Trash2, Calendar, CheckCircle2, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import type { MediaItem, ConnectedProfile } from './types';
import { planAutoCrop, computeCenterCrop } from '@/lib/posting/auto-crop-image';

interface MediaLibraryProps {
  clientId: string | null;
  media: MediaItem[];
  profiles: ConnectedProfile[];
  loading: boolean;
  onUploadComplete: () => void;
  showUnusedOnly: boolean;
  onToggleUnused: () => void;
  onMediaClick: (item: MediaItem) => void;
  onMediaDelete: (mediaId: string) => void;
}

export function MediaLibrary({
  clientId,
  media,
  profiles,
  loading,
  onUploadComplete,
  showUnusedOnly,
  onToggleUnused,
  onMediaClick,
  onMediaDelete,
}: MediaLibraryProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<MediaItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { confirm: confirmBulkDelete, dialog: bulkDeleteDialog } = useConfirm({
    title: 'Delete selected media',
    description: `Delete ${selectedIds.size} media item${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`,
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const { confirm: confirmSingleDelete, dialog: singleDeleteDialog } = useConfirm({
    title: 'Delete media',
    description: pendingDeleteItem ? `Delete "${pendingDeleteItem.filename}"? This cannot be undone.` : '',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const hasSelection = selectedIds.size > 0;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Step 1 (image only): measure intrinsic dims first so we can decide
      // whether to auto-crop before uploading. This is what makes "1080x1090
      // becomes 1080x1080" possible without a second upload round-trip.
      let effectiveFile: File = file;
      let dims: { width: number; height: number } | null = null;
      let cropApplied: { from: string; to: string } | null = null;

      if (file.type.startsWith('image/')) {
        const sourceDims = await readImageDimensions(file);
        if (sourceDims) {
          const plan = planAutoCrop(sourceDims.width, sourceDims.height);
          if (plan) {
            const cropped = await cropImageFile(file, sourceDims, plan.targetRatio);
            if (cropped) {
              effectiveFile = cropped.file;
              dims = { width: cropped.width, height: cropped.height };
              cropApplied = {
                from: `${sourceDims.width}x${sourceDims.height}`,
                to: `${cropped.width}x${cropped.height} (${plan.label})`,
              };
            }
          }
          if (!dims) dims = sourceDims;
        }
      }

      // Step 2: Get presigned URL using effectiveFile's type/name
      const urlRes = await fetch('/api/scheduler/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get-upload-url',
          contentType: effectiveFile.type,
          filename: effectiveFile.name,
        }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, publicUrl } = await urlRes.json();

      // Step 3: Upload effectiveFile (possibly cropped) directly to Zernio CDN
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (evt) => {
        if (evt.lengthComputable) {
          setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error('Upload to CDN failed'));
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', effectiveFile.type);
        xhr.send(effectiveFile);
      });

      // Step 4: Thumbnail + (for video) backfill dims later. For images, the
      // public URL itself IS the thumbnail.
      let thumbnailUrl: string | null = null;
      if (effectiveFile.type.startsWith('image/')) {
        thumbnailUrl = publicUrl;
      } else if (effectiveFile.type.startsWith('video/')) {
        thumbnailUrl = await generateVideoThumbnail(effectiveFile);
      }

      // Step 5: Confirm upload in our DB
      const confirmRes = await fetch('/api/scheduler/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm-upload',
          client_id: clientId,
          filename: effectiveFile.name,
          public_url: publicUrl,
          file_size_bytes: effectiveFile.size,
          mime_type: effectiveFile.type,
          thumbnail_url: thumbnailUrl,
          ...(dims ? { width: dims.width, height: dims.height } : {}),
        }),
      });
      if (!confirmRes.ok) throw new Error('Failed to save media record');

      if (cropApplied) {
        toast.success(`Auto-cropped ${cropApplied.from} to ${cropApplied.to}`);
      } else {
        toast.success('Media uploaded');
      }
      onUploadComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  /**
   * Center-crop an image File to a target aspect ratio using a canvas.
   * Returns null if the browser fails to decode or canvas.toBlob errors out;
   * the caller falls back to uploading the original.
   */
  async function cropImageFile(
    file: File,
    source: { width: number; height: number },
    targetRatio: number,
  ): Promise<{ file: File; width: number; height: number } | null> {
    try {
      const crop = computeCenterCrop(source.width, source.height, targetRatio);
      const objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = document.createElement('img');
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('image decode failed'));
        i.src = objectUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = crop.width;
      canvas.height = crop.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        return null;
      }
      ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      URL.revokeObjectURL(objectUrl);

      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = mime === 'image/jpeg' ? 0.92 : undefined;
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, mime, quality),
      );
      if (!blob) return null;

      const ext = mime === 'image/png' ? 'png' : 'jpg';
      const base = file.name.replace(/\.[^.]+$/, '');
      return {
        file: new File([blob], `${base}.cropped.${ext}`, { type: mime }),
        width: crop.width,
        height: crop.height,
      };
    } catch {
      return null;
    }
  }

  /** Read intrinsic pixel dimensions from an image File. */
  function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const dims =
          img.naturalWidth && img.naturalHeight
            ? { width: img.naturalWidth, height: img.naturalHeight }
            : null;
        URL.revokeObjectURL(url);
        resolve(dims);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /** Extract a thumbnail frame from a video file as a data URL */
  function generateVideoThumbnail(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        video.currentTime = Math.min(1, video.duration * 0.1);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = Math.round(320 * (video.videoHeight / video.videoWidth));
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          URL.revokeObjectURL(video.src);
          resolve(dataUrl);
        } catch {
          resolve(null);
        }
      };

      video.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 5000);
      video.src = URL.createObjectURL(file);
    });
  }

  function handleDragStart(e: React.DragEvent, item: MediaItem) {
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
  }

  function handleItemClick(e: React.MouseEvent, item: MediaItem) {
    if (selectMode || e.shiftKey || e.metaKey || e.ctrlKey || hasSelection) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    } else {
      onMediaClick(item);
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ok = await confirmBulkDelete();
    if (!ok) return;
    selectedIds.forEach(id => onMediaDelete(id));
    setSelectedIds(new Set());
  }

  function handleScheduleSelected() {
    if (selectedIds.size === 0) return;
    // Open the first selected item for scheduling
    const firstSelected = media.find(m => selectedIds.has(m.id));
    if (firstSelected) {
      onMediaClick(firstSelected);
    }
    setSelectedIds(new Set());
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatSize(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-nativz-border">
        <h3 className="text-sm font-medium text-text-primary mb-2">Media library</h3>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !clientId}
          className="w-full"
          size="sm"
        >
          <Upload size={14} />
          {uploading ? `Uploading ${uploadProgress}%` : 'Upload media'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          className="hidden"
        />

        {/* Upload progress */}
        {uploading && (
          <div className="mt-2 h-1.5 rounded-full bg-surface-hover overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-text transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Filters + selection actions */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-nativz-border">
        <button
          onClick={() => {
            if (selectMode) {
              setSelectMode(false);
              setSelectedIds(new Set());
            } else {
              setSelectMode(true);
            }
          }}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors cursor-pointer ${
            selectMode
              ? 'bg-accent-surface text-accent-text'
              : 'bg-surface-hover text-text-muted hover:text-text-secondary'
          }`}
        >
          <MousePointerClick size={10} />
          Select
        </button>
        <button
          onClick={onToggleUnused}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors cursor-pointer ${
            showUnusedOnly
              ? 'bg-accent-surface text-accent-text'
              : 'bg-surface-hover text-text-muted hover:text-text-secondary'
          }`}
        >
          <Filter size={10} />
          Unused
          {showUnusedOnly && (
            <X size={10} className="ml-0.5" />
          )}
        </button>

        {hasSelection && (
          <>
            <div className="h-3 w-px bg-nativz-border" />
            <button
              onClick={handleScheduleSelected}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-accent-surface text-accent-text cursor-pointer"
            >
              <Calendar size={10} />
              Schedule
            </button>
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-red-500/10 text-red-400 cursor-pointer"
            >
              <Trash2 size={10} />
              Delete
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}
              className="text-[10px] text-text-muted cursor-pointer hover:text-text-secondary"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Media grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-surface-hover animate-pulse" />
            ))}
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Film size={32} className="text-text-muted mb-2" />
            <p className="text-sm text-text-muted">
              {showUnusedOnly ? 'No unused media' : 'No media yet'}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Upload videos to get started
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {media.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  onClick={(e) => handleItemClick(e, item)}
                  className={`group relative aspect-square rounded-lg overflow-hidden bg-surface-hover cursor-pointer border-2 transition-all ${
                    isSelected
                      ? 'border-accent-text ring-1 ring-accent-text/30'
                      : 'border-transparent hover:border-accent-text/30'
                  }`}
                >
                  {item.thumbnail_url ? (
                    <Image
                      src={item.thumbnail_url}
                      alt={item.filename}
                      fill
                      sizes="180px"
                      quality={70}
                      className="object-cover"
                      unoptimized={false}
                    />
                  ) : item.mime_type?.startsWith('image/') && item.late_media_url ? (
                    <Image
                      src={item.late_media_url}
                      alt={item.filename}
                      fill
                      sizes="180px"
                      quality={70}
                      className="object-cover"
                      unoptimized={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Film size={20} className="text-text-muted" />
                    </div>
                  )}

                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent-text flex items-center justify-center">
                      <CheckCircle2 size={12} className="text-white" />
                    </div>
                  )}

                  {/* Duration overlay */}
                  {item.duration_seconds && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white">
                      {formatDuration(item.duration_seconds)}
                    </span>
                  )}

                  {/* Used indicator */}
                  {item.is_used && (
                    <Badge variant="info" className="absolute top-1 left-1 text-[10px] px-1 py-0">
                      Used
                    </Badge>
                  )}

                  {/* Hover info */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5 pointer-events-none">
                    <p className="text-[10px] text-white truncate">{item.filename}</p>
                    {item.file_size_bytes && (
                      <p className="text-[10px] text-white/60">{formatSize(item.file_size_bytes)}</p>
                    )}
                  </div>

                  {/* Delete button on hover */}
                  {!isSelected && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setPendingDeleteItem(item);
                        const ok = await confirmSingleDelete();
                        setPendingDeleteItem(null);
                        if (ok) onMediaDelete(item.id);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80 cursor-pointer"
                    >
                      <Trash2 size={12} className="text-white" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hint */}
      {!hasSelection && media.length > 0 && (
        <div className="px-3 py-2 border-t border-nativz-border">
          <p className="text-[10px] text-text-muted text-center">
            {selectMode ? 'Click items to select' : 'Click to schedule · Drag to calendar'}
          </p>
        </div>
      )}

      {bulkDeleteDialog}
      {singleDeleteDialog}
    </div>
  );
}
