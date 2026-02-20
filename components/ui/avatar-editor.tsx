'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Loader2, X, Check, ZoomIn, ZoomOut } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

interface AvatarEditorProps {
  value: string | null;
  onChange: (url: string) => void;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'h-16 w-16',
  md: 'h-20 w-20',
  lg: 'h-24 w-24',
};

const CROP_SIZE = 300;

export function AvatarEditor({ value, onChange, size = 'lg' }: AvatarEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Use a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2 MB.');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setEditorOpen(true);
    };
    reader.readAsDataURL(file);

    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleCropComplete(blob: Blob) {
    setEditorOpen(false);
    setImageSrc(null);
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', blob, 'avatar.png');

      const res = await fetch('/api/account/upload-avatar', {
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
    }
  }

  function handleCancel() {
    setEditorOpen(false);
    setImageSrc(null);
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
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
              alt="Profile photo"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-xs font-medium text-white">Change</span>
            </div>
          </>
        ) : uploading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 size={28} className="animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-muted">
            <Camera size={28} />
          </div>
        )}
      </button>
      <p className="text-xs text-text-muted text-center">Click to upload</p>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {editorOpen && imageSrc && (
        <CropModal
          src={imageSrc}
          onSave={handleCropComplete}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

interface CropModalProps {
  src: string;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

function CropModal({ src, onSave, onCancel }: CropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Transform state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Load image
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      // Fit image so shortest side fills the crop area
      const fitScale = CROP_SIZE / Math.min(img.width, img.height);
      setScale(fitScale);
      setOffset({ x: 0, y: 0 });
      setLoaded(true);
    };
    img.src = src;
  }, [src]);

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw image centered with offset and scale
    const imgW = img.width * scale;
    const imgH = img.height * scale;
    const drawX = (w - imgW) / 2 + offset.x;
    const drawY = (h - imgH) / 2 + offset.y;

    ctx.drawImage(img, drawX, drawY, imgW, imgH);

    // Draw circular mask overlay
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw circle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [scale, offset]);

  useEffect(() => {
    if (loaded) draw();
  }, [loaded, draw]);

  // Mouse handlers
  function handlePointerDown(e: React.PointerEvent) {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }

  function handlePointerUp() {
    dragging.current = false;
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setScale((prev) => Math.max(0.1, Math.min(5, prev + delta)));
  }

  function handleZoomIn() {
    setScale((prev) => Math.min(5, prev + 0.1));
  }

  function handleZoomOut() {
    setScale((prev) => Math.max(0.1, prev - 0.1));
  }

  function handleSave() {
    const img = imgRef.current;
    if (!img) return;

    // Create a hidden canvas to crop the circular area
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = CROP_SIZE;
    cropCanvas.height = CROP_SIZE;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Draw the image at the same position as the preview
    const canvasW = CROP_SIZE + 80; // match canvas padding
    const imgW = img.width * scale;
    const imgH = img.height * scale;
    const drawX = (canvasW - imgW) / 2 + offset.x - 40; // subtract padding
    const drawY = (canvasW - imgH) / 2 + offset.y - 40;

    ctx.drawImage(img, drawX, drawY, imgW, imgH);

    cropCanvas.toBlob(
      (blob) => {
        if (blob) onSave(blob);
      },
      'image/png',
      1
    );
  }

  const canvasSize = CROP_SIZE + 80;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface border border-nativz-border rounded-2xl p-6 shadow-xl max-w-md w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">Position your photo</h3>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-text-muted">Drag to reposition. Scroll or use buttons to zoom.</p>

        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            width={canvasSize}
            height={canvasSize}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            className="rounded-xl cursor-grab active:cursor-grabbing touch-none"
            style={{ width: canvasSize, height: canvasSize, background: '#111' }}
          />
        </div>

        {/* Zoom controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleZoomOut}
            className="rounded-lg p-2 text-text-muted hover:bg-surface-hover transition-colors"
          >
            <ZoomOut size={18} />
          </button>
          <div className="w-24 h-1.5 bg-surface-hover rounded-full relative">
            <div
              className="absolute top-0 left-0 h-full bg-accent rounded-full transition-all"
              style={{ width: `${Math.min(100, ((scale - 0.1) / 4.9) * 100)}%` }}
            />
          </div>
          <button
            type="button"
            onClick={handleZoomIn}
            className="rounded-lg p-2 text-text-muted hover:bg-surface-hover transition-colors"
          >
            <ZoomIn size={18} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            <Check size={16} />
            Save photo
          </Button>
        </div>
      </div>
    </div>
  );
}
