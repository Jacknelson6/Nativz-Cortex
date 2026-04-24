'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Boxes, Plus, X } from 'lucide-react';
import { InfoCard } from './info-card';

/**
 * InfoBrandStructureCard — products + brand aliases. Tag lists are inherently
 * inline-edit (add chip, click X to remove), so this card has no Edit/Save
 * toggle — adds and removes commit immediately. The card chrome matches the
 * rest of the brand stack so visual rhythm stays consistent.
 *
 * Writes are serialized through `pendingRef` so two rapid adds can't race.
 * Rollback values come from refs that mirror state synchronously — closure
 * snapshots would freeze before the prior queued write committed and silently
 * drop the most-recent entry on failure.
 */

export function InfoBrandStructureCard({
  clientId,
  initialProducts,
  initialAliases,
}: {
  clientId: string;
  initialProducts: string[];
  initialAliases: string[];
}) {
  const router = useRouter();
  const [products, setProducts] = useState<string[]>(initialProducts);
  const [aliases, setAliases] = useState<string[]>(initialAliases);
  const productsRef = useRef(products);
  const aliasesRef = useRef(aliases);
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { aliasesRef.current = aliases; }, [aliases]);
  const pendingRef = useRef<Promise<unknown>>(Promise.resolve());

  async function patch(fields: { products?: string[]; brand_aliases?: string[] }) {
    const run = async () => {
      const undoProducts = fields.products ? productsRef.current : undefined;
      const undoAliases = fields.brand_aliases ? aliasesRef.current : undefined;
      if (fields.products) {
        productsRef.current = fields.products;
        setProducts(fields.products);
      }
      if (fields.brand_aliases) {
        aliasesRef.current = fields.brand_aliases;
        setAliases(fields.brand_aliases);
      }
      try {
        const res = await fetch(`/api/clients/${clientId}/brand-profile`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(fields),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast.error((d as { error?: string }).error || 'Failed to save');
          if (undoProducts !== undefined) {
            productsRef.current = undoProducts;
            setProducts(undoProducts);
          }
          if (undoAliases !== undefined) {
            aliasesRef.current = undoAliases;
            setAliases(undoAliases);
          }
          return;
        }
        router.refresh();
      } catch {
        toast.error('Something went wrong');
        if (undoProducts !== undefined) {
          productsRef.current = undoProducts;
          setProducts(undoProducts);
        }
        if (undoAliases !== undefined) {
          aliasesRef.current = undoAliases;
          setAliases(undoAliases);
        }
      }
    };
    pendingRef.current = pendingRef.current.then(run, run);
    return pendingRef.current;
  }

  return (
    <InfoCard
      icon={<Boxes size={16} />}
      title="Brand structure"
      description="Named products and the alternate names this brand goes by — helps AI reference the right thing in context."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TagListBlock
          label="Products"
          values={products}
          placeholder="e.g. Fix-and-flip loan"
          onCommit={(next) => void patch({ products: next })}
        />
        <TagListBlock
          label="Brand aliases"
          values={aliases}
          placeholder="e.g. Nivasa Brand"
          onCommit={(next) => void patch({ brand_aliases: next })}
        />
      </div>
    </InfoCard>
  );
}

function TagListBlock({
  label, values, placeholder, onCommit,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onCommit: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) { setDraft(''); return; }
    onCommit([...values, v]);
    setDraft('');
  }

  function removeTag(t: string) {
    onCommit(values.filter((x) => x !== t));
  }

  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <div className="mt-2 flex flex-wrap gap-1.5 min-h-[28px]">
        {values.length === 0 && (
          <span className="text-sm italic text-text-muted">None yet</span>
        )}
        {values.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-background px-2.5 py-0.5 text-xs text-text-secondary"
          >
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="text-text-muted hover:text-red-400 transition-colors"
              aria-label={`Remove ${t}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
        />
        <button
          type="button"
          onClick={addTag}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface-hover px-2.5 py-1 text-xs text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Plus size={10} /> Add
        </button>
      </div>
    </div>
  );
}
