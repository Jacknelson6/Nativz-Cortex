'use client';

import Link from 'next/link';
import { Dna, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BrandDnaTabReadyPanelProps {
  clientName: string;
  /** When set, shows a link to the full Brand DNA admin page. */
  clientSlug?: string;
  onOpenGallery: () => void;
}

/**
 * Shown on the Brand DNA tab when the client already has draft/active Brand DNA.
 * Ad generation happens from the Gallery tab (wizard modal).
 */
export function BrandDnaTabReadyPanel({ clientName, clientSlug, onOpenGallery }: BrandDnaTabReadyPanelProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-nativz-border bg-surface">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.12),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-lg px-6 py-14 text-center sm:px-10 sm:py-16">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-text">
          <Dna size={32} strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">Brand kit is ready</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          <span className="text-text-secondary font-medium">{clientName}</span> has an active Brand DNA profile. Edit
          colors, voice, and assets on the full Brand DNA page, or go to the gallery to generate ads.
        </p>
        <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Button type="button" size="lg" shape="pill" className="shadow-lg shadow-accent/15" onClick={onOpenGallery}>
            <Sparkles size={18} />
            Open gallery
          </Button>
          {clientSlug ? (
            <Link
              href={`/admin/clients/${clientSlug}/brand-dna`}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-nativz-border px-6 py-3 text-base font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover hover:scale-[1.02] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              View Brand DNA
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
