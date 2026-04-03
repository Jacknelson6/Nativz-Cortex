'use client';

import { cn } from '@/lib/utils';
import {
  BATCH_CTA_PRESET_OPTIONS,
  DEFAULT_BATCH_CTA,
} from '@/lib/ad-creatives/batch-cta-presets';

export const BATCH_CTA_MAX_LEN = 30;

type BatchCtaFieldProps = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  /** Extra classes on the outer wrapper */
  className?: string;
};

/**
 * Explains AI copy hierarchy (headline → subheadline → shared CTA) and collects the batch CTA.
 */
export function BatchCtaField({ id = 'batch-cta', value, onChange, className }: BatchCtaFieldProps) {
  const v = value.slice(0, BATCH_CTA_MAX_LEN);
  const active = (v.trim() || DEFAULT_BATCH_CTA).toLowerCase();

  return (
    <div className={cn('space-y-6', className)}>
      <div className="space-y-4">
        <section className="space-y-1">
          <p className="text-sm font-medium text-text-primary">Headline</p>
          <p className="text-xs text-text-muted leading-relaxed">
            AI writes a unique headline for each ad — sharp hook tied to your brand, product, and offer.
          </p>
        </section>
        <section className="space-y-1">
          <p className="text-sm font-medium text-text-primary">Subheadline</p>
          <p className="text-xs text-text-muted leading-relaxed">
            AI writes a supporting line under each headline — benefit or proof, still different every variation.
          </p>
        </section>
      </div>

      <div className="space-y-3 pt-1 border-t border-nativz-border/80">
        <div>
          <label htmlFor={id} className="text-sm font-medium text-text-primary">
            Call to action (every ad in this batch)
          </label>
          <p className="text-xs text-text-muted mt-1 leading-relaxed">
            Same button label on every creative so the batch feels consistent.
          </p>
        </div>
      <div className="flex flex-wrap gap-1.5">
        {BATCH_CTA_PRESET_OPTIONS.map((preset) => {
          const selected = active === preset.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                selected
                  ? 'border-accent-border bg-accent-surface text-accent-text shadow-[0_0_0_1px_rgba(59,130,246,0.12)]'
                  : 'border-nativz-border bg-background/60 text-text-muted hover:border-accent/25 hover:text-text-secondary',
              )}
            >
              {preset}
            </button>
          );
        })}
      </div>
      <div className="space-y-1">
        <input
          id={id}
          type="text"
          value={v}
          onChange={(e) => onChange(e.target.value.slice(0, BATCH_CTA_MAX_LEN))}
          maxLength={BATCH_CTA_MAX_LEN}
          placeholder={DEFAULT_BATCH_CTA}
          className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/45 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/25"
        />
        <p className="text-xs text-text-muted tabular-nums">
          {v.trim().length}/{BATCH_CTA_MAX_LEN}
        </p>
      </div>
      </div>
    </div>
  );
}
