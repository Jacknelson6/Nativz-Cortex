'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles, ArrowUpRight, Loader2 } from 'lucide-react';
import { InfoCard } from './info-card';

/** Mirrors `clients.brand_dna_status`. Loose `string` fallback covers any
 *  future statuses we haven't enumerated yet. */
export type BrandDnaStatus = 'none' | 'queued' | 'generating' | 'generated' | string;

/**
 * InfoBrandDnaSlim — minimized placeholder for the Brand DNA section on the
 * info page. The full bento view lives on /admin/clients/[slug]/settings/brand;
 * here we show status + last-updated + a one-click regenerate that fires the
 * generation directly against the client's saved website URL — no modal, no
 * wizard step. The page re-renders via router.refresh() so the dossier pill
 * + this card both flip to the in-progress state immediately.
 *
 * Slated to be replaced by the Client Repo in Spec B — a file-browser surface
 * for branding guidelines, PDFs-as-markdown, and logos. When that lands this
 * card swaps to a repo preview.
 */
export function InfoBrandDnaSlim({
  clientId,
  websiteUrl,
  brandDnaStatus,
  brandDnaUpdatedAt,
  brandProfileHref,
}: {
  clientId: string;
  websiteUrl: string | null;
  brandDnaStatus: BrandDnaStatus;
  brandDnaUpdatedAt: string | null;
  brandProfileHref?: string;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const isGenerating = brandDnaStatus === 'generating' || brandDnaStatus === 'queued';
  const hasDna = brandDnaStatus === 'generated';

  async function startGeneration() {
    if (!websiteUrl?.trim()) {
      toast.error('Add a website URL in Identity first — Brand DNA reads from it.');
      return;
    }
    setStarting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brand-dna/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ websiteUrl: websiteUrl.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to start Brand DNA generation');
        return;
      }
      toast.success(hasDna ? 'Regenerating Brand DNA…' : 'Brand DNA generation started');
      router.refresh();
    } catch {
      toast.error('Something went wrong');
    } finally {
      setStarting(false);
    }
  }

  return (
    <InfoCard
      icon={<Sparkles size={16} />}
      title="Brand DNA"
      description={
        hasDna
          ? 'AI-distilled visual + verbal identity — drives every content flow in Cortex.'
          : 'Generate a brand guideline directly from the saved website URL. Becomes the source of truth for AI-powered content.'
      }
      rightSlot={
        brandProfileHref && hasDna ? (
          <Link
            href={brandProfileHref}
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            View full guideline
            <ArrowUpRight size={12} />
          </Link>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={brandDnaStatus} />
          <div className="min-w-0">
            <p className="text-sm text-text-primary">
              {isGenerating
                ? 'Generation in progress'
                : hasDna
                  ? 'Brand DNA generated'
                  : 'No Brand DNA yet'}
            </p>
            {brandDnaUpdatedAt && hasDna && (
              <p className="text-[11px] text-text-muted">
                Last updated {new Date(brandDnaUpdatedAt).toLocaleString()}
              </p>
            )}
            {!hasDna && !isGenerating && websiteUrl?.trim() && (
              <p className="text-[11px] text-text-muted">
                Will read <span className="font-mono text-text-secondary">{cleanDomain(websiteUrl)}</span> and distill fonts, colors, voice, and positioning.
              </p>
            )}
            {!hasDna && !isGenerating && !websiteUrl?.trim() && (
              <p className="text-[11px] italic text-text-muted">
                Add a website URL in Identity first — Brand DNA reads from it.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isGenerating ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-surface px-3 py-1.5 text-xs text-accent-text">
              <Loader2 size={12} className="animate-spin" />
              Generating…
            </span>
          ) : (
            <button
              type="button"
              onClick={startGeneration}
              disabled={starting || !websiteUrl?.trim()}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-text/30 bg-accent-surface px-3 py-1.5 text-xs text-accent-text hover:bg-accent-text/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {starting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {hasDna ? 'Regenerate' : 'Generate Brand DNA'}
            </button>
          )}
        </div>
      </div>

    </InfoCard>
  );
}

function StatusDot({ status }: { status: BrandDnaStatus }) {
  if (status === 'generating' || status === 'queued') {
    return <span className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0" aria-hidden />;
  }
  if (status === 'generated') {
    return <span className="h-2 w-2 rounded-full bg-accent shrink-0" aria-hidden />;
  }
  return <span className="h-2 w-2 rounded-full bg-nativz-border shrink-0" aria-hidden />;
}

function cleanDomain(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}
