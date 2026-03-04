'use client';

import { useState, useRef } from 'react';
import { Upload, X, Film, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { MediaItem } from './types';

interface MediaLibraryProps {
  clientId: string | null;
  media: MediaItem[];
  loading: boolean;
  onUploadComplete: () => void;
  showUnusedOnly: boolean;
  onToggleUnused: () => void;
}

export function MediaLibrary({
  clientId,
  media,
  loading,
  onUploadComplete,
  showUnusedOnly,
  onToggleUnused,
}: MediaLibraryProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ action: 'get-upload-url', contentType: file.type }),
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

      // Step 3: Confirm upload in our DB
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

  function handleDragStart(e: React.DragEvent, item: MediaItem) {
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
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
    <div className="flex flex-col h-full w-72 border-r border-nativz-border bg-surface">
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

      {/* Filters */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-nativz-border">
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
      </div>

      {/* Media grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[9/16] rounded-lg bg-surface-hover animate-pulse" />
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
            {media.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-surface-hover cursor-grab active:cursor-grabbing border border-transparent hover:border-accent-text/30 transition-colors"
              >
                {item.thumbnail_url || item.late_media_url ? (
                  <img
                    src={item.thumbnail_url ?? item.late_media_url ?? ''}
                    alt={item.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film size={20} className="text-text-muted" />
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
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5">
                  <p className="text-[10px] text-white truncate">{item.filename}</p>
                  {item.file_size_bytes && (
                    <p className="text-[9px] text-white/60">{formatSize(item.file_size_bytes)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
