'use client';

import { useState, useRef } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface ImageUploadProps {
  value: string | null;
  onChange: (url: string) => void;
  size?: 'sm' | 'md' | 'lg';
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

export function ImageUpload({ value, onChange, size = 'md' }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate client-side
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
      // Reset input so re-selecting same file triggers change
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
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
            <Image
              src={value}
              alt="Client logo"
              fill
              className="object-contain p-1"
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
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
