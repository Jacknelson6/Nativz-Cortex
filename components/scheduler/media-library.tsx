'use client';

import { useState, useRef } from 'react';
import { Upload, X, Film, Filter, Trash2, Calendar, CheckCircle2, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import type { MediaItem, ConnectedProfile } from './types';

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
      // Step 1: Get presigned URL from our API
      const urlRes = await fetch('/api/scheduler/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-upload-url', contentType: file.type, filename: file.name }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, publicUrl } = await urlRes.json();

      // Step 2: Upload directly to Late CDN with progress
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
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: Generate thumbnail
      let thumbnailUrl: string | null = null;
      if (file.type.startsWith('image/')) {
        thumbnailUrl = publicUrl;
      } else if (file.type.startsWith('video/')) {
        thumbnailUrl = await generateVideoThumbnail(file);
      }

      // Step 4: Confirm upload in our DB
      const confirmRes = await fetch('/api/scheduler/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm-upload',
          client_id: clientId,
          filename: file.name,
          public_url: publicUrl,
          file_size_bytes: file.size,
          mime_type: file.type,
          thumbnail_url: thumbnailUrl,
        }),
      });
      if (!confirmRes.ok) throw new Error('Failed to save media record');

      toast.success('Media uploaded');
      onUploadComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
                    <img
                      src={item.thumbnail_url}
                      alt={item.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : item.mime_type?.startsWith('image/') && item.late_media_url ? (
                    <img
                      src={item.late_media_url}
                      alt={item.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
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
                    <Badge variant="info" className="absolute top-1 left-1 text-[9px] px-1 py-0">
                      Used
                    </Badge>
                  )}

                  {/* Hover info */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5 pointer-events-none">
                    <p className="text-[10px] text-white truncate">{item.filename}</p>
                    {item.file_size_bytes && (
                      <p className="text-[9px] text-white/60">{formatSize(item.file_size_bytes)}</p>
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
