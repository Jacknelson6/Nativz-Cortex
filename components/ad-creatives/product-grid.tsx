'use client';

import { useState } from 'react';
import { Plus, Link, Loader2, Check, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';

interface ProductGridProps {
  products: ScrapedProduct[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
  onAddProduct: (product: ScrapedProduct) => void;
  itemLabel?: string;
}

export function ProductGrid({ products, selectedIndices, onToggle, onAddProduct, itemLabel = 'Products' }: ProductGridProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addImageUrl, setAddImageUrl] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [scraping, setScraping] = useState(false);

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

  if (products.length === 0 && !showAddForm && !showUrlForm) {
    return (
      <div className="rounded-xl border border-dashed border-nativz-border bg-surface/50 p-8 text-center space-y-3">
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
    <div className="space-y-3">
      {/* Product cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {products.map((product, i) => {
          const selected = selectedIndices.has(i);
          return (
            <button
              key={`${product.name}-${i}`}
              type="button"
              onClick={() => onToggle(i)}
              className={`relative rounded-xl border p-2 text-left transition-all cursor-pointer ${
                selected
                  ? 'border-accent bg-accent-surface/30 ring-1 ring-accent/30'
                  : 'border-nativz-border bg-surface hover:border-accent/30'
              }`}
            >
              {/* Selection indicator */}
              {selected && (
                <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-accent flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}

              {/* Image */}
              {product.imageUrl ? (
                <div className="aspect-square rounded-lg overflow-hidden bg-background mb-2">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="aspect-square rounded-lg bg-background mb-2 flex items-center justify-center">
                  <Package size={24} className="text-text-muted/30" />
                </div>
              )}

              {/* Name */}
              <p className="text-xs font-medium text-text-primary line-clamp-2">{product.name}</p>
              {product.description ? (
                <p className="text-[10px] text-text-muted mt-1 line-clamp-2">{product.description}</p>
              ) : null}
              {product.price && (
                <p className="text-xs text-text-muted mt-0.5">{product.price}</p>
              )}
            </button>
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
