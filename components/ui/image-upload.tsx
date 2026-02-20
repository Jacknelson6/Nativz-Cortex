'use client';

import { useState, useRef } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';

interface ImageUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeMap = {
  sm: 'h-16 w-16',
  md: 'h-20 w-20',
  lg: 'h-24 w-24',
};

const iconSizeMap = {
  sm: 20,
  md: 24,
  lg: 28,
};

export function ImageUpload({ value, onChange, size = 'md', label }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setError('Use a JPEG, PNG, WebP, or SVG image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2 MB.');
      return;
    }

    setError('');
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/clients/upload-logo', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Upload failed. Try again.');
        return;
      }

      const { url } = await res.json();
      onChange(url);
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className={`group relative ${sizeMap[size]} rounded-full border-2 border-dashed border-nativz-border bg-surface-hover overflow-hidden transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50`}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label || 'Logo'}
              className="absolute inset-0 h-full w-full object-cover scale-125"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-xs font-medium text-white">Change</span>
            </div>
          </>
        ) : uploading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 size={iconSizeMap[size]} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">
            <Camera size={iconSizeMap[size]} />
          </div>
        )}
      </button>
      <p className="text-xs text-text-muted">{label || 'Client logo'}</p>
      {value && !uploading && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
        >
          <Trash2 size={12} />
          Remove logo
        </button>
      )}
      {error && <p className="text-xs text-red-400 text-center max-w-[200px]">{error}</p>}
    </div>
  );
}
