'use client';

import { useState, useCallback, useRef } from 'react';
import { Plus, Link, Loader2, Check, Package, Upload, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';

interface ProductGridProps {
  /** Required for per-product image upload to storage. */
  clientId?: string;
  products: ScrapedProduct[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  onAddProduct: (product: ScrapedProduct) => void;
  /** Merge fields into an existing product (e.g. after manual image upload). */
  onUpdateProduct?: (index: number, patch: Partial<ScrapedProduct>) => void;
  /** Shown above the grid when data comes from Brand DNA, etc. */
  dataSourceHint?: string;
  itemLabel?: string;
}

function ProductThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const onErr = useCallback(() => setFailed(true), []);
  if (failed) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-1 bg-background text-text-muted/40">
        <Package size={22} />
        <span className="text-[9px] px-1 text-center leading-tight">Image blocked or missing</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={onErr}
    />
  );
}

export function ProductGrid({
  clientId,
  products,
  selectedIndices,
  onToggle,
  onAddProduct,
  onUpdateProduct,
  dataSourceHint,
  itemLabel = 'Products',
}: ProductGridProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addImageUrl, setAddImageUrl] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [expandedCtaOffer, setExpandedCtaOffer] = useState<Set<number>>(() => new Set());
  const pickUploadIndex = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleCtaOfferPanel(index: number) {
    setExpandedCtaOffer((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const canUploadImages = Boolean(clientId?.trim() && onUpdateProduct);

  function handleAddManual() {
    if (!addName.trim()) return;
    onAddProduct({
      name: addName.trim(),
      imageUrl: addImageUrl.trim() || null,
      description: addDescription.trim(),
      price: null,
    });
    setAddName('');
    setAddImageUrl('');
    setAddDescription('');
    setShowAddForm(false);
  }

  async function handlePasteUrl() {
    if (!pasteUrl.trim()) return;
    setScraping(true);
    try {
      const res = await fetch('/api/ad-creatives/scrape-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pasteUrl.trim() }),
      });
      if (!res.ok) throw new Error('Scrape failed');
      const data = await res.json();
      if (data.product) {
        onAddProduct(data.product);
        setPasteUrl('');
        setShowUrlForm(false);
        toast.success(`Found: ${data.product.name}`);
      } else {
        toast.error('No product found on that page');
      }
    } catch {
      toast.error('Failed to scrape product from URL');
    } finally {
      setScraping(false);
    }
  }

  function openProductImagePicker(index: number) {
    if (!canUploadImages) return;
    pickUploadIndex.current = index;
    fileInputRef.current?.click();
  }

  async function handleProductImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const index = pickUploadIndex.current;
    e.target.value = '';
    pickUploadIndex.current = null;
    if (!file || index === null || !clientId?.trim() || !onUpdateProduct) return;

    setUploadingIndex(index);
    try {
      const body = new FormData();
      body.set('file', file);
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/ad-creatives/wizard-product-image`, {
        method: 'POST',
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Upload failed');
      }
      if (!data.url) {
        throw new Error('No image URL returned');
      }
      onUpdateProduct(index, { imageUrl: data.url });
      toast.success('Image added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingIndex(null);
    }
  }

  if (products.length === 0 && !showAddForm && !showUrlForm) {
    return (
      <div className="rounded-2xl border border-dashed border-nativz-border bg-background/35 p-10 text-center space-y-4">
        <Package size={32} className="mx-auto text-text-muted/40" />
        <p className="text-sm text-text-muted">No {itemLabel.toLowerCase()} found on this site.</p>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
            <Plus size={14} /> Add {itemLabel.toLowerCase().replace(/s$/, '')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowUrlForm(true)}>
            <Link size={14} /> Paste URL
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={handleProductImageFile}
      />
      {dataSourceHint && (
        <p className="text-xs text-text-muted rounded-xl border border-nativz-border bg-background/40 px-4 py-2.5 leading-relaxed">
          {dataSourceHint}
        </p>
      )}
      {/* Product cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {products.map((product, i) => {
          const selected = selectedIndices.has(i);
          const cardClass = `relative rounded-xl border p-2 text-left transition-all ${
            selected
              ? 'border-accent bg-accent-surface/30 ring-1 ring-accent/30'
              : 'border-nativz-border bg-surface hover:border-accent/30'
          }`;

          return (
            <div key={`${product.name}-${i}`} className={cardClass}>
              {selected && (
                <div className="absolute top-1.5 right-1.5 z-[1] h-5 w-5 rounded-full bg-accent flex items-center justify-center pointer-events-none">
                  <Check size={12} className="text-white" />
                </div>
              )}

              {product.imageUrl ? (
                <button
                  type="button"
                  onClick={() => onToggle(i)}
                  className="mb-2 block w-full cursor-pointer rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <div className="aspect-square overflow-hidden rounded-lg bg-background ring-1 ring-white/[0.06]">
                    <ProductThumb src={product.imageUrl} alt={product.name} />
                  </div>
                </button>
              ) : (
                <div className="relative mb-2 flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-background px-1 ring-1 ring-white/[0.06]">
                  {uploadingIndex === i ? (
                    <Loader2 size={22} className="animate-spin text-accent-text" />
                  ) : (
                    <>
                      <Package size={22} className="text-text-muted/30" />
                      {canUploadImages ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 max-w-full px-2 text-[10px]"
                          onClick={() => openProductImagePicker(i)}
                        >
                          <Upload size={12} className="shrink-0" />
                          Upload image
                        </Button>
                      ) : (
                        <span className="text-center text-[9px] leading-tight text-text-muted/70">
                          No image from scrape
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => onToggle(i)}
                className="w-full cursor-pointer rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <p className="text-xs font-medium text-text-primary line-clamp-2">{product.name}</p>
                {product.description ? (
                  <p className="text-[10px] text-text-muted mt-1 line-clamp-2">{product.description}</p>
                ) : null}
                {product.price ? (
                  <p className="text-xs text-text-muted mt-0.5">{product.price}</p>
                ) : null}
              </button>

              {onUpdateProduct ? (
                <div className="mt-2 border-t border-nativz-border/50 pt-2">
                  <button
                    type="button"
                    onClick={() => toggleCtaOfferPanel(i)}
                    className="flex w-full items-center justify-between gap-1 rounded-md px-1 py-1 text-[10px] font-medium text-text-muted hover:bg-background/80 hover:text-text-secondary"
                  >
                    <span>CTA & offer</span>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 transition-transform ${expandedCtaOffer.has(i) ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {expandedCtaOffer.has(i) ? (
                    <div className="mt-2 space-y-2 px-0.5" onClick={(e) => e.stopPropagation()}>
                      <Input
                        placeholder="CTA (e.g. Shop now)"
                        value={product.cta ?? ''}
                        maxLength={100}
                        className="h-8 text-[11px]"
                        onChange={(e) => onUpdateProduct(i, { cta: e.target.value || null })}
                      />
                      <Input
                        placeholder="Offer (e.g. Free shipping this week)"
                        value={product.offer ?? ''}
                        maxLength={300}
                        className="h-8 text-[11px]"
                        onChange={(e) => onUpdateProduct(i, { offer: e.target.value || null })}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={14} /> Add {itemLabel.toLowerCase().replace(/s$/, '')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowUrlForm(!showUrlForm)}>
          <Link size={14} /> Paste URL
        </Button>
        <span className="text-xs text-text-muted ml-auto">
          {selectedIndices.size} of {products.length} selected
        </span>
      </div>

      {/* Add product form */}
      {showAddForm && (
        <div className="rounded-lg border border-nativz-border bg-surface p-4 space-y-3">
          <Input
            placeholder="Product name"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
          />
          <Input
            placeholder="Image URL (optional)"
            value={addImageUrl}
            onChange={(e) => setAddImageUrl(e.target.value)}
          />
          {canUploadImages ? (
            <p className="text-[11px] leading-relaxed text-text-muted">
              For scraped products without a photo, use <span className="text-text-secondary">Upload image</span> on the
              card.
            </p>
          ) : null}
          <Input
            placeholder="Description (optional)"
            value={addDescription}
            onChange={(e) => setAddDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddManual} disabled={!addName.trim()}>
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Paste URL form */}
      {showUrlForm && (
        <div className="rounded-lg border border-nativz-border bg-surface p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/products/widget"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasteUrl()}
              disabled={scraping}
            />
            <Button size="sm" onClick={handlePasteUrl} disabled={scraping || !pasteUrl.trim()}>
              {scraping ? <Loader2 size={14} className="animate-spin" /> : 'Scrape'}
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowUrlForm(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
