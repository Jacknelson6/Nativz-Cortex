'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { BrandDNACards } from '@/components/brand-dna/brand-dna-cards';
import { AdCreativeGuidelineUploads } from './ad-creative-guideline-uploads';

interface BrandDnaWizardRailProps {
  clientId: string;
  clientSlug?: string;
  className?: string;
}

/**
 * Read-only Brand DNA bento cards beside the ad wizard so logo, colors, tone, and products
 * stay visible on the Generate tab without opening the full Brand DNA page.
 */
export function BrandDnaWizardRail({ clientId, clientSlug, className = '' }: BrandDnaWizardRailProps) {
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/clients/${clientId}/brand-dna`);
        const data = (await res.json().catch(() => ({}))) as { metadata?: unknown; error?: string };
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Could not load Brand DNA');
        }
        const meta = data.metadata;
        if (!cancelled) {
          setMetadata(meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <aside className={`lg:sticky lg:top-6 lg:self-start ${className}`}>
      <div className="rounded-2xl border border-nativz-border bg-surface/90 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-nativz-border/80 px-3 py-2.5 bg-white/[0.02]">
          <p className="text-xs font-semibold text-text-primary tracking-tight">Brand DNA</p>
          {clientSlug ? (
            <Link
              href={`/admin/clients/${clientSlug}/brand-dna`}
              className="text-[11px] font-medium text-accent-text hover:underline shrink-0"
            >
              Client page
            </Link>
          ) : null}
        </div>

        <div className="border-t border-nativz-border/80 p-2">
          <AdCreativeGuidelineUploads clientId={clientId} variant="compact" />
        </div>
        <div className="max-h-[min(42vh,360px)] sm:max-h-[min(50vh,440px)] lg:max-h-[min(78vh,720px)] overflow-y-auto overscroll-contain p-2 pb-4 [scrollbar-width:thin]">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-text-muted">
              <Loader2 size={16} className="animate-spin text-accent-text" />
              Loading Brand DNA…
            </div>
          )}
          {!loading && err && (
            <p className="text-xs text-text-muted py-4 px-2 text-center leading-relaxed">{err}</p>
          )}
          {!loading && !err && metadata && (
            <BrandDNACards metadata={metadata} clientId={clientId} editable={false} />
          )}
          {!loading && !err && !metadata && (
            <p className="text-xs text-text-muted py-4 px-2 text-center leading-relaxed">
              No Brand DNA metadata yet. Run generation from the <span className="text-text-secondary">Brand DNA</span>{' '}
              tab in ad creatives, or from the client&apos;s Brand DNA page.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
