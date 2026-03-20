'use client';

import { useState } from 'react';
import { Check, Pencil, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PromptPreviewData {
  templateId: string;
  templateName: string;
  templateImageUrl: string;
  variationIndex: number;
  copy: { headline: string; subheadline: string; cta: string };
  prompt: string;
  styleNotes: string;
}

interface PromptReviewProps {
  previews: PromptPreviewData[];
  onApproveAll: (editedPreviews: PromptPreviewData[]) => void;
  onCancel: () => void;
  generating: boolean;
}

export function PromptReview({ previews, onApproveAll, onCancel, generating }: PromptReviewProps) {
  const [edited, setEdited] = useState<PromptPreviewData[]>(previews);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  function updateCopy(index: number, field: 'headline' | 'subheadline' | 'cta', value: string) {
    setEdited((prev) => prev.map((p, i) =>
      i === index ? { ...p, copy: { ...p.copy, [field]: value } } : p,
    ));
  }

  function updateStyleNotes(index: number, value: string) {
    setEdited((prev) => prev.map((p, i) =>
      i === index ? { ...p, styleNotes: value } : p,
    ));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Review prompts</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Edit copy and style notes before generating. {edited.length} creative{edited.length !== 1 ? 's' : ''} queued.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={generating}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onApproveAll(edited)} disabled={generating}>
            {generating ? (
              <><Loader2 size={14} className="animate-spin" /> Generating...</>
            ) : (
              <><Sparkles size={14} /> Generate all ({edited.length})</>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {edited.map((preview, i) => (
          <div
            key={`${preview.templateId}-${preview.variationIndex}`}
            className="rounded-xl border border-nativz-border bg-surface overflow-hidden"
          >
            {/* Header */}
            <button
              type="button"
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
            >
              {/* Template thumbnail */}
              <div className="h-12 w-12 rounded-lg overflow-hidden bg-background shrink-0">
                {preview.templateImageUrl && (
                  <img src={preview.templateImageUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>

              {/* Copy preview */}
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-text-primary truncate">{preview.copy.headline}</p>
                <p className="text-xs text-text-muted truncate">{preview.copy.subheadline}</p>
              </div>

              {/* CTA badge */}
              <span className="text-xs text-accent-text bg-accent-surface px-2 py-0.5 rounded-full shrink-0">
                {preview.copy.cta}
              </span>

              {/* Expand icon */}
              {expandedIndex === i ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
            </button>

            {/* Expanded editor */}
            {expandedIndex === i && (
              <div className="border-t border-nativz-border p-4 space-y-3">
                {/* Copy fields */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wide">Headline</label>
                    <input
                      value={preview.copy.headline}
                      onChange={(e) => updateCopy(i, 'headline', e.target.value)}
                      className="w-full mt-1 rounded-lg border border-nativz-border bg-background px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wide">Subheadline</label>
                    <input
                      value={preview.copy.subheadline}
                      onChange={(e) => updateCopy(i, 'subheadline', e.target.value)}
                      className="w-full mt-1 rounded-lg border border-nativz-border bg-background px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted uppercase tracking-wide">CTA</label>
                    <input
                      value={preview.copy.cta}
                      onChange={(e) => updateCopy(i, 'cta', e.target.value)}
                      className="w-full mt-1 rounded-lg border border-nativz-border bg-background px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
                    />
                  </div>
                </div>

                {/* Style notes */}
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Style direction</label>
                  <textarea
                    value={preview.styleNotes}
                    onChange={(e) => updateStyleNotes(i, e.target.value)}
                    rows={3}
                    className="w-full mt-1 rounded-lg border border-nativz-border bg-background px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 resize-none"
                  />
                </div>

                {/* Full prompt (read-only, collapsible) */}
                <details className="group">
                  <summary className="text-[10px] text-text-muted uppercase tracking-wide cursor-pointer hover:text-text-secondary">
                    View full prompt
                  </summary>
                  <pre className="mt-2 text-[10px] text-text-muted bg-background rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap font-mono">
                    {preview.prompt}
                  </pre>
                </details>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
