'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { BRAND_DNA_BENTO_SURFACE } from '@/components/brand-dna/brand-dna-cards';

interface BrandDnaGuidelinePanelProps {
  clientSlug?: string;
}

/**
 * Points to the canonical Brand DNA page for the full guideline — keeps the wizard brand step light.
 */
export function BrandDnaGuidelinePanel({ clientSlug }: BrandDnaGuidelinePanelProps) {
  return (
    <div className={`${BRAND_DNA_BENTO_SURFACE} p-4 sm:p-5`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-nativz-border bg-background/40">
            <FileText size={18} className="text-text-muted" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-text-primary">Full brand guideline</p>
            <p className="text-xs text-text-muted leading-relaxed">
              Open Brand DNA to read or edit the complete document — same content you use everywhere in Cortex.
            </p>
          </div>
        </div>
        {clientSlug ? (
          <Link
            href={`/admin/clients/${clientSlug}/brand-dna`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-nativz-border bg-background/50 px-4 py-2.5 text-sm font-medium text-accent-text transition-colors hover:bg-surface-hover hover:border-accent/30"
          >
            Open Brand DNA
          </Link>
        ) : (
          <p className="text-xs text-text-muted sm:text-right">Link unavailable — open this client from the roster.</p>
        )}
      </div>
    </div>
  );
}
