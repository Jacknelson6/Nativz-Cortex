'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowUpRight, Loader2 } from 'lucide-react';
import { OnboardWizard } from '@/components/brand-dna/onboard-wizard';
import { InfoCard } from './info-card';
import type { BrandDnaStatus } from './client-dossier-header';

/**
 * InfoBrandDnaSlim — minimized placeholder for the Brand DNA section on the
 * info page. The full bento view lives on /admin/clients/[slug]/settings/brand;
 * here we show status + last-updated + entry points only.
 *
 * Slated to be replaced by the Client Repo in Spec B — a file-browser surface
 * for branding guidelines, PDFs-as-markdown, and logos. When that lands this
 * card swaps to a repo preview.
 */
export function InfoBrandDnaSlim({
  clientId,
  clientName,
  brandDnaStatus,
  brandDnaUpdatedAt,
  brandProfileHref,
}: {
  clientId: string;
  clientName: string;
  brandDnaStatus: BrandDnaStatus;
  brandDnaUpdatedAt: string | null;
  brandProfileHref?: string;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);

  const isGenerating = brandDnaStatus === 'generating';
  const hasDna = brandDnaStatus === 'generated';

  return (
    <>
      <InfoCard
        icon={<Sparkles size={16} />}
        title="Brand DNA"
        description={
          hasDna
            ? 'AI-distilled visual + verbal identity — drives every content flow in Cortex.'
            : 'Generate a brand guideline from the website. Becomes source of truth for AI-powered content.'
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
              {!hasDna && !isGenerating && (
                <p className="text-[11px] text-text-muted">
                  Uses the client website to distill fonts, colors, voice, and positioning.
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
                onClick={() => setWizardOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent-text/30 bg-accent-surface px-3 py-1.5 text-xs text-accent-text hover:bg-accent-text/10 transition-colors"
              >
                <Sparkles size={12} />
                {hasDna ? 'Regenerate' : 'Generate Brand DNA'}
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] italic text-text-muted leading-relaxed">
          Coming soon: branding guidelines, client PDFs, and asset files consolidated into a
          per-client repo for faster agent retrieval.
        </p>
      </InfoCard>

      <OnboardWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); }}
        existingClientId={clientId}
        existingClientName={clientName}
      />
    </>
  );
}

function StatusDot({ status }: { status: BrandDnaStatus }) {
  if (status === 'generating') {
    return <span className="h-2 w-2 rounded-full bg-accent animate-pulse shrink-0" aria-hidden />;
  }
  if (status === 'generated') {
    return <span className="h-2 w-2 rounded-full bg-accent shrink-0" aria-hidden />;
  }
  return <span className="h-2 w-2 rounded-full bg-nativz-border shrink-0" aria-hidden />;
}
