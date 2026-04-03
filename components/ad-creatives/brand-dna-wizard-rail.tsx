'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { BrandDNACards } from '@/components/brand-dna/brand-dna-cards';
import { BrandDNASectionEditor } from '@/components/brand-dna/brand-dna-section-editor';
import { AdCreativeGuidelineUploads } from './ad-creative-guideline-uploads';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';
import {
  NATIVZ_BRAND_DNA_UPDATED_EVENT,
  type NativzBrandDnaUpdatedDetail,
} from '@/lib/brand-dna/brand-dna-updated-event';

interface BrandDnaWizardPanelProps {
  clientId: string;
  /** Shown in the panel header before “brand DNA” (e.g. EcoView brand DNA). */
  clientName?: string;
  /**
   * `inline` — full-width block in the wizard main column (Brand & assets step).
   * `rail` — sticky sidebar on later steps so DNA stays visible while picking templates, etc.
   */
  variant: 'inline' | 'rail';
}

function useBrandDnaMetadata(clientId: string) {
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    function onBrandDnaUpdated(e: Event) {
      const d = (e as CustomEvent<NativzBrandDnaUpdatedDetail>).detail;
      if (d?.clientId === clientId) refetch();
    }
    window.addEventListener(NATIVZ_BRAND_DNA_UPDATED_EVENT, onBrandDnaUpdated);
    return () => window.removeEventListener(NATIVZ_BRAND_DNA_UPDATED_EVENT, onBrandDnaUpdated);
  }, [clientId, refetch]);

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
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Failed to load');
          setMetadata(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [clientId, fetchKey]);

  return { metadata, setMetadata, loading, err };
}

export function BrandDnaWizardPanel({ clientId, clientName, variant }: BrandDnaWizardPanelProps) {
  const { metadata, setMetadata, loading, err } = useBrandDnaMetadata(clientId);
  const [editingSection, setEditingSection] = useState<string | null>(null);

  function handleSectionSaved(updated: Partial<BrandGuidelineMetadata>) {
    setMetadata((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updated } as Record<string, unknown>;
    });
  }

  const title = clientName?.trim()
    ? `${clientName.trim()} brand DNA`
    : 'Brand DNA';

  const header = (
    <div className="border-b border-nativz-border/80 px-3 py-2.5 bg-surface/20">
      <p className="min-w-0 truncate text-xs font-semibold text-text-primary tracking-tight" title={title}>
        {title}
      </p>
    </div>
  );

  const cardsBlock = (
    <>
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
        <BrandDNACards
          metadata={metadata}
          clientId={clientId}
          editable
          onEditSection={setEditingSection}
        />
      )}
      {!loading && !err && !metadata && (
        <p className="text-xs text-text-muted py-4 px-2 text-center leading-relaxed">
          No Brand DNA metadata yet. Run generation from the <span className="text-text-secondary">Brand DNA</span>{' '}
          tab in ad creatives, or from the client&apos;s Brand DNA page.
        </p>
      )}
    </>
  );

  const shell = (
    <div className="rounded-2xl border border-nativz-border bg-surface/90 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] overflow-hidden">
      {header}
      {variant === 'rail' ? (
        <>
          <div className="border-t border-nativz-border/80 p-2">
            <AdCreativeGuidelineUploads clientId={clientId} variant="compact" />
          </div>
          <div className="max-h-[min(42vh,360px)] sm:max-h-[min(50vh,440px)] lg:max-h-[min(78vh,720px)] overflow-y-auto overscroll-contain p-2 pb-4 [scrollbar-width:thin]">
            {cardsBlock}
          </div>
        </>
      ) : (
        <div className="p-3 sm:p-4">{cardsBlock}</div>
      )}
    </div>
  );

  const editor =
    editingSection && metadata ? (
      <BrandDNASectionEditor
        section={editingSection}
        clientId={clientId}
        metadata={metadata as unknown as BrandGuidelineMetadata}
        open
        onClose={() => setEditingSection(null)}
        onSaved={handleSectionSaved}
      />
    ) : null;

  if (variant === 'rail') {
    return (
      <>
        <aside className="lg:sticky lg:top-6 lg:self-start w-full">{shell}</aside>
        {editor}
      </>
    );
  }

  return (
    <>
      {shell}
      {editor}
    </>
  );
}

/** Sticky sidebar DNA reference (templates → generate steps). */
export function BrandDnaWizardRail(props: Omit<BrandDnaWizardPanelProps, 'variant'>) {
  return <BrandDnaWizardPanel variant="rail" {...props} />;
}
