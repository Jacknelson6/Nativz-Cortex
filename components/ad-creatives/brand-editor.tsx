'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Plus, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { ScrapedBrand } from '@/lib/ad-creatives/scrape-brand';

interface BrandEditorProps {
  brand: ScrapedBrand;
  onBrandChange: (brand: ScrapedBrand) => void;
  clientId?: string;
}

export function BrandEditor({ brand, onBrandChange, clientId }: BrandEditorProps) {
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState<number | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const persistBrand = useCallback(
    async (b: ScrapedBrand) => {
      if (!clientId) return;
      try {
        const res = await fetch('/api/ad-creatives/brand-context', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, brand: b }),
        });
        if (!res.ok) throw new Error('Failed to save');
      } catch {
        toast.error('Failed to save brand context');
      }
    },
    [clientId],
  );

  useEffect(() => {
    if (!clientId) return;
    const t = window.setTimeout(() => {
      void persistBrand(brand);
    }, 800);
    return () => window.clearTimeout(t);
  }, [brand, clientId, persistBrand]);

  function updateField<K extends keyof ScrapedBrand>(key: K, value: ScrapedBrand[K]) {
    onBrandChange({ ...brand, [key]: value });
  }

  function removeColor(index: number) {
    const next = [...brand.colors];
    next.splice(index, 1);
    updateField('colors', next);
  }

  function addColor(hex: string) {
    if (brand.colors.includes(hex)) return;
    updateField('colors', [...brand.colors, hex]);
  }

  function changeColor(index: number, hex: string) {
    const next = [...brand.colors];
    next[index] = hex;
    updateField('colors', next);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    updateField('logoUrl', objectUrl);
  }

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          className="relative shrink-0 h-16 w-16 rounded-lg border border-nativz-border bg-background overflow-hidden group cursor-pointer"
        >
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.name} className="h-full w-full object-contain p-1" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-text-muted">
              <Upload size={20} />
            </div>
          )}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Pencil size={14} className="text-white" />
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          {editingName ? (
            <input
              autoFocus
              value={brand.name}
              onChange={(e) => updateField('name', e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
              className="text-lg font-semibold text-text-primary bg-transparent border-b border-accent/50 outline-none w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-lg font-semibold text-text-primary hover:text-accent-text transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {brand.name}
              <Pencil size={12} className="opacity-0 group-hover:opacity-60" />
            </button>
          )}

          {editingDesc ? (
            <textarea
              autoFocus
              value={brand.description}
              onChange={(e) => updateField('description', e.target.value)}
              onBlur={() => setEditingDesc(false)}
              rows={2}
              className="text-sm text-text-muted bg-transparent border border-nativz-border rounded-lg p-2 outline-none w-full resize-none focus:border-accent/50"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingDesc(true)}
              className="text-sm text-text-muted hover:text-text-secondary transition-colors cursor-pointer text-left line-clamp-2"
            >
              {brand.description || 'Click to add description...'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-muted uppercase tracking-wide mr-1">Colors</span>
        {brand.colors.map((color, i) => (
          <div key={`${color}-${i}`} className="relative group">
            <button
              type="button"
              onClick={() => setColorPickerOpen(colorPickerOpen === i ? null : i)}
              className="h-7 w-7 rounded-full border-2 border-white/10 cursor-pointer transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
              title={color}
            />
            <button
              type="button"
              onClick={() => removeColor(i)}
              className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X size={8} />
            </button>
            {colorPickerOpen === i && (
              <input
                type="color"
                value={color}
                onChange={(e) => changeColor(i, e.target.value)}
                onBlur={() => setColorPickerOpen(null)}
                className="absolute top-9 left-0 z-10"
                autoFocus
              />
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => colorInputRef.current?.click()}
          className="h-7 w-7 rounded-full border-2 border-dashed border-nativz-border flex items-center justify-center text-text-muted hover:border-accent/40 hover:text-accent-text transition-colors cursor-pointer"
        >
          <Plus size={12} />
        </button>
        <input
          ref={colorInputRef}
          type="color"
          className="hidden"
          onChange={(e) => addColor(e.target.value)}
        />
      </div>
    </div>
  );
}
