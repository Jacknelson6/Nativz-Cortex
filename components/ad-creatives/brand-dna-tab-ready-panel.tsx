'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ai/markdown';
import { BrandDNACards, BRAND_DNA_BENTO_SURFACE } from '@/components/brand-dna/brand-dna-cards';
import { BrandDNASectionEditor } from '@/components/brand-dna/brand-dna-section-editor';
import { CompletenessBadge } from '@/components/brand-dna/completeness-badge';
import { formatRelativeTime } from '@/lib/utils/format';
import type { BrandGuidelineMetadata } from '@/lib/knowledge/types';
import { AdCreativeGuidelineUploads } from './ad-creative-guideline-uploads';

interface BrandDnaTabReadyPanelProps {
  clientId: string;
  clientName: string;
  clientSlug?: string;
  websiteUrl?: string | null;
  brandDnaStatus?: string | null;
  onOpenGallery: () => void;
}

type DnaPayload = {
  content: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

/**
 * Brand DNA tab when draft/active guideline exists: full bento + editable sections + guideline doc,
 * without requiring navigation to the client Brand DNA route.
 */
export function BrandDnaTabReadyPanel({
  clientId,
  clientName,
  clientSlug,
  websiteUrl,
  brandDnaStatus,
  onOpenGallery,
}: BrandDnaTabReadyPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<DnaPayload | null>(null);
  const [localMetadata, setLocalMetadata] = useState<BrandGuidelineMetadata | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const metadata = (localMetadata ?? (payload?.metadata as Record<string, unknown> | null) ?? null) as Record<
    string,
    unknown
  > | null;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-dna`);
      const data = (await res.json().catch(() => ({}))) as {
        content?: string;
        metadata?: unknown;
        created_at?: string;
        updated_at?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Could not load Brand DNA');
      }
      setPayload({
        content: data.content ?? '',
        metadata: data.metadata,
        created_at: data.created_at ?? '',
        updated_at: data.updated_at ?? '',
      });
      setLocalMetadata(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSectionSaved(updated: Partial<BrandGuidelineMetadata>) {
    setLocalMetadata((prev) => {
      if (prev) return { ...prev, ...updated };
      const base = payload?.metadata as BrandGuidelineMetadata | undefined;
      return { ...(base ?? {}), ...updated } as BrandGuidelineMetadata;
    });
  }

  const canRecrawl = (websiteUrl?.trim().length ?? 0) > 0 && brandDnaStatus !== 'generating';

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-dna/refresh`, { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof d.error === 'string' ? d.error : 'Refresh failed');
      }
      toast.success('Re-crawl started — refresh this page when it finishes');
      router.refresh();
    } catch (refreshErr) {
      toast.error(refreshErr instanceof Error ? refreshErr.message : 'Re-crawl failed');
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-nativz-border bg-surface py-20">
        <Loader2 size={28} className="animate-spin text-accent-text" />
        <p className="text-sm text-text-muted">Loading Brand DNA…</p>
      </div>
    );
  }

  if (err || !payload || !metadata) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-nativz-border bg-surface">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.12),transparent)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-lg px-6 py-12 text-center sm:px-10 sm:py-14">
          <h2 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl">Couldn&apos;t load Brand DNA</h2>
          <p className="mt-2 text-sm text-text-muted">{err ?? 'No guideline data returned.'}</p>
          <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
            <Button type="button" size="lg" shape="pill" onClick={() => void load()}>
              Try again
            </Button>
            <Button type="button" variant="outline" size="lg" shape="pill" onClick={onOpenGallery}>
              <Sparkles size={18} />
              Open gallery
            </Button>
            {clientSlug ? (
              <Link
                href={`/admin/clients/${clientSlug}/brand-dna`}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-nativz-border px-6 py-3 text-base font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover hover:scale-[1.02] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Open Brand DNA page
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-nativz-border bg-surface p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">Brand DNA</h2>
              <CompletenessBadge metadata={metadata} size="md" />
            </div>
            <p className="text-sm text-text-muted">
              Colors, voice, and assets for <span className="font-medium text-text-secondary">{clientName}</span>. Same
              Brand DNA as on the client profile — edits apply everywhere in Cortex.
            </p>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Clock size={12} />
              Updated {formatRelativeTime(payload.updated_at || payload.created_at)}
            </span>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Button type="button" size="lg" shape="pill" className="shadow-lg shadow-accent/15" onClick={onOpenGallery}>
              <Sparkles size={18} />
              Open gallery
            </Button>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {canRecrawl ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void handleRefresh()} disabled={refreshing}>
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? 'Starting…' : 'Re-run crawl'}
                </Button>
              ) : null}
              {clientSlug ? (
                <Link
                  href={`/admin/clients/${clientSlug}/brand-dna`}
                  className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-accent-text transition-colors hover:bg-surface-hover hover:underline"
                >
                  View on client page
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <AdCreativeGuidelineUploads clientId={clientId} />

        <BrandDNACards metadata={metadata} clientId={clientId} editable onEditSection={setEditingSection} />

        <div className={`${BRAND_DNA_BENTO_SURFACE} p-3 sm:p-4`}>
          <h3 className="mb-3 text-sm font-semibold text-text-primary">Full brand guideline</h3>
          <div className="prose prose-invert prose-sm max-h-[min(50vh,480px)] max-w-none overflow-y-auto overscroll-contain pr-1 text-text-secondary [scrollbar-width:thin]">
            <Markdown content={payload.content} />
          </div>
        </div>
      </div>

      {editingSection ? (
        <BrandDNASectionEditor
          section={editingSection}
          clientId={clientId}
          metadata={metadata as unknown as BrandGuidelineMetadata}
          open
          onClose={() => setEditingSection(null)}
          onSaved={handleSectionSaved}
        />
      ) : null}
    </>
  );
}
