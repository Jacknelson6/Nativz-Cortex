'use client';

import { useState, useRef } from 'react';
import { Upload, Check, X, Image, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface BrandMediaPanelProps {
  mediaUrls: string[];
  selectedUrls: Set<string>;
  onToggle: (url: string) => void;
  onUpload: (urls: string[]) => void;
  clientId?: string;
}

export function BrandMediaPanel({ mediaUrls, selectedUrls, onToggle, onUpload, clientId }: BrandMediaPanelProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !clientId) return;
    setUploading(true);

    const uploadedUrls: string[] = [];

    try {
      for (const file of Array.from(fileList).slice(0, 20)) {
        // Upload to Supabase Storage
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`/api/clients/${clientId}/ad-creatives/media`, {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.url) uploadedUrls.push(data.url);
        }
      }

      if (uploadedUrls.length > 0) {
        onUpload(uploadedUrls);
        toast.success(`Uploaded ${uploadedUrls.length} image${uploadedUrls.length !== 1 ? 's' : ''}`);
      }
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (mediaUrls.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/50 p-6 text-center space-y-2">
        <Image size={24} className="mx-auto text-text-muted/40" />
        <p className="text-xs text-text-muted">No brand media found. Upload product images, logos, or lifestyle photos.</p>
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Upload media
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {selectedUrls.size} of {mediaUrls.length} images selected for generation
        </p>
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Add more
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {mediaUrls.map((url, i) => {
          const selected = selectedUrls.has(url);
          return (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => onToggle(url)}
              className={`relative aspect-square rounded-lg overflow-hidden border transition-all cursor-pointer ${
                selected
                  ? 'border-accent ring-1 ring-accent/30'
                  : 'border-nativz-border opacity-60 hover:opacity-100'
              }`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              {selected && (
                <div className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                  <Check size={10} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
