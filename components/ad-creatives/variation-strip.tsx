'use client';

import { X, Minus, Plus } from 'lucide-react';
import type { KandyTemplate } from '@/lib/ad-creatives/types';

interface VariationStripProps {
  templates: KandyTemplate[];
  variations: Map<string, number>;
  onVariationChange: (templateId: string, count: number) => void;
  onRemove: (templateId: string) => void;
}

export function VariationStrip({ templates, variations, onVariationChange, onRemove }: VariationStripProps) {
  const totalCount = templates.reduce((sum, t) => sum + (variations.get(t.id) ?? 2), 0);
  const countsBreakdown = templates.map((t) => variations.get(t.id) ?? 2).join(' + ');

  return (
    <div className="space-y-3">
      {/* Selected templates with per-template controls */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {templates.map((template) => {
          const count = variations.get(template.id) ?? 2;
          return (
            <div
              key={template.id}
              className="shrink-0 rounded-xl border border-nativz-border bg-surface p-2 flex items-center gap-3 min-w-[200px]"
            >
              {/* Thumbnail */}
              <div className="h-12 w-12 rounded-lg overflow-hidden bg-background shrink-0">
                {template.image_url ? (
                  <img
                    src={template.image_url}
                    alt={template.collection_name ?? 'Template'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-surface" />
                )}
              </div>

              {/* Name + stepper */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-secondary truncate">
                  {template.collection_name ?? 'Template'}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={() => onVariationChange(template.id, Math.max(1, count - 1))}
                    disabled={count <= 1}
                    className="h-5 w-5 rounded bg-background border border-nativz-border flex items-center justify-center text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Minus size={10} />
                  </button>
                  <span className="text-sm font-medium text-text-primary w-5 text-center">{count}</span>
                  <button
                    type="button"
                    onClick={() => onVariationChange(template.id, Math.min(10, count + 1))}
                    disabled={count >= 10}
                    className="h-5 w-5 rounded bg-background border border-nativz-border flex items-center justify-center text-text-muted hover:text-text-primary disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Plus size={10} />
                  </button>
                  <span className="text-[10px] text-text-muted ml-0.5">ads</span>
                </div>
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => onRemove(template.id)}
                className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Total count */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">
          {templates.length} template{templates.length !== 1 ? 's' : ''}: {countsBreakdown}
        </span>
        <span className="font-semibold text-text-primary">
          {totalCount} ad{totalCount !== 1 ? 's' : ''} total
        </span>
      </div>
    </div>
  );
}
