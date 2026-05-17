'use client';

/**
 * Products screen.
 *
 * Captures the brand's product list — title + optional URL per row.
 * Submit replaces all `client_products` rows with source='onboarding_upload'
 * for the client (handled server-side in the public PATCH route).
 *
 * Optional step: clients can skip if they don't sell discrete products
 * (e.g. a service business). They can come back later from the same link.
 */

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProductEntry, ProductsState } from '@/lib/onboarding/types';

interface Props {
  value: Record<string, unknown> | null;
  clientName: string;
  submitting: boolean;
  onSubmit: (value: Record<string, unknown>) => void;
  onBack?: () => void;
}

function makeEmpty(): ProductEntry {
  return { title: '', url: '' };
}

export function ProductsScreen({ value, clientName, submitting, onSubmit, onBack }: Props) {
  const initial = (value as ProductsState | null) ?? { products: [] };
  const [products, setProducts] = useState<ProductEntry[]>(
    initial.products.length > 0 ? initial.products : [makeEmpty()],
  );

  function updateRow(idx: number, patch: Partial<ProductEntry>) {
    setProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function addRow() {
    setProducts((prev) => [...prev, makeEmpty()]);
  }

  function removeRow(idx: number) {
    setProducts((prev) => (prev.length === 1 ? [makeEmpty()] : prev.filter((_, i) => i !== idx)));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (submitting) return;
        const cleaned = products
          .map((p) => ({
            title: p.title.trim(),
            url: p.url?.trim() || undefined,
          }))
          .filter((p) => p.title.length > 0);
        onSubmit({ products: cleaned });
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h1 className="text-[28px] leading-tight font-semibold text-text-primary sm:text-3xl">
          What does {clientName} sell?
        </h1>
        <p className="text-base text-text-secondary">
          List the products or offers we should highlight. Add a URL if it lives on your site.
          Skip if you don&apos;t sell discrete products.
        </p>
      </div>

      <div className="space-y-3">
        {products.map((p, idx) => (
          <div
            key={idx}
            className="space-y-3 rounded-lg border border-nativz-border bg-surface px-4 py-4"
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Input
                id={`product-title-${idx}`}
                label="Title"
                placeholder="e.g. Hydration Mix"
                value={p.title}
                onChange={(e) => updateRow(idx, { title: e.target.value })}
                disabled={submitting}
                maxLength={200}
              />
              <Input
                id={`product-url-${idx}`}
                label="URL (optional)"
                type="url"
                inputMode="url"
                placeholder="https://yourbrand.com/products/..."
                value={p.url ?? ''}
                onChange={(e) => updateRow(idx, { url: e.target.value })}
                disabled={submitting}
                maxLength={500}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(idx)}
                disabled={submitting}
                className="self-end"
                aria-label="Remove product"
              >
                <Trash2 size={14} />
                Remove
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={submitting}
        >
          <Plus size={14} />
          Add another
        </Button>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={submitting}
            className="self-start sm:self-auto"
          >
            Back
          </Button>
        ) : (
          <div />
        )}
        <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </form>
  );
}
