'use client';

import { useRouter } from 'next/navigation';
import {
  Dna,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  Type,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardWizard } from '@/components/brand-dna/onboard-wizard';

interface BrandDnaRequiredPanelProps {
  clientId: string;
  clientName: string;
  brandDnaStatus: string | null | undefined;
  /** Client profile website — pre-fills the generate wizard when set. */
  websiteUrl?: string | null;
}

/**
 * Full-page Brand DNA setup for ad creatives: run generation inline (no separate modal).
 */
export function BrandDnaRequiredPanel({
  clientId,
  clientName,
  brandDnaStatus,
  websiteUrl,
}: BrandDnaRequiredPanelProps) {
  const router = useRouter();
  const isGenerating = brandDnaStatus === 'generating';

  return (
    <div className="space-y-8 lg:space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-nativz-border bg-surface">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.18),transparent)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl"
          aria-hidden
        />
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_minmax(0,1fr)] lg:items-center lg:gap-12">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent-text">
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Step before ads
                </>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                Build a Brand DNA kit for{' '}
                <span className="text-accent-text">{clientName}</span>
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-muted">
                {isGenerating ? (
                  <>
                    Analysis is running on the server. You can leave this tab — when it finishes, tap{' '}
                    <span className="text-text-secondary">Refresh</span> to open the ad wizard.
                  </>
                ) : (
                  <>
                    We pull colors, logos, voice, and products from the site (and any files you add) so
                    generated ads stay on-brand. Run it once here — no need to jump to another page.
                  </>
                )}
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: Palette, label: 'Colors & logos', sub: 'From the live site' },
                { icon: Type, label: 'Tone of voice', sub: 'Guidelines-ready' },
                { icon: Wand2, label: 'Product context', sub: 'For ad copy & visuals' },
              ].map(({ icon: Icon, label, sub }) => (
                <li
                  key={label}
                  className="flex gap-3 rounded-xl border border-nativz-border/80 bg-background/40 px-3 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-text">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-xs font-medium text-text-primary">{label}</p>
                    <p className="text-[11px] text-text-muted leading-snug">{sub}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-nativz-border"
                onClick={() => router.refresh()}
              >
                <RefreshCw size={14} />
                Refresh status
              </Button>
              <p className="text-[11px] text-text-muted">
                After Brand DNA is <span className="text-text-secondary">draft</span> or{' '}
                <span className="text-text-secondary">active</span>, this tab loads the ad wizard automatically.
              </p>
            </div>
          </div>
          <div className="relative flex min-h-[200px] items-center justify-center lg:min-h-[280px]">
            <div className="absolute inset-0 rounded-2xl border border-dashed border-nativz-border/60 bg-background/20" />
            <div
              className={`relative flex h-36 w-36 items-center justify-center rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/20 to-accent/5 shadow-[0_0_40px_-12px_rgba(59,130,246,0.5)] sm:h-44 sm:w-44 ${isGenerating ? 'animate-pulse' : ''}`}
            >
              {isGenerating ? (
                <Loader2 className="h-14 w-14 text-accent-text animate-spin" strokeWidth={1.5} />
              ) : (
                <Dna className="h-14 w-14 text-accent-text" strokeWidth={1.5} />
              )}
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label="Brand DNA generation"
        className="border-t border-nativz-border/60 pt-8 lg:pt-10"
      >
        <OnboardWizard
          open
          layout="inline"
          className="max-w-2xl mx-auto w-full"
          onClose={() => router.refresh()}
          existingClientId={clientId}
          existingClientName={clientName}
          initialWebsiteUrl={websiteUrl}
        />
      </section>
    </div>
  );
}
