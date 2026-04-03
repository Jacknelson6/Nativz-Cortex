'use client';

import Link from 'next/link';
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
import { BrandDNAProgress } from '@/components/brand-dna/brand-dna-progress';

interface BrandDnaRequiredPanelProps {
  clientId: string;
  clientName: string;
  brandDnaStatus: string | null | undefined;
  /** Client profile website — pre-fills the generate wizard when set. */
  websiteUrl?: string | null;
  /** For “view on client page” while generating or in helper copy. */
  clientSlug?: string;
  /** After user activates Brand DNA in the wizard — keep them on this tab to see the full inline kit. */
  onBrandDnaActivated?: () => void;
}

/**
 * Brand DNA setup inside ad creatives: generate, progress, review, and activate — same data as the client Brand DNA route.
 */
export function BrandDnaRequiredPanel({
  clientId,
  clientName,
  brandDnaStatus,
  websiteUrl,
  clientSlug,
  onBrandDnaActivated,
}: BrandDnaRequiredPanelProps) {
  const router = useRouter();
  const isGenerating = brandDnaStatus === 'generating';

  if (isGenerating) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-nativz-border bg-surface p-6 sm:p-8">
          <div className="mb-6 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-text">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
              Building Brand DNA for {clientName}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
              When this run finishes, the full kit (cards and guideline) appears on this{' '}
              <span className="text-text-secondary">Brand DNA</span> tab.{' '}
              {clientSlug ? (
                <>
                  You can also follow the same profile on{' '}
                  <Link
                    href={`/admin/clients/${clientSlug}/brand-dna`}
                    className="font-medium text-accent-text underline-offset-2 hover:underline"
                  >
                    the client&apos;s Brand DNA page
                  </Link>
                  .
                </>
              ) : (
                'The client profile has the same Brand DNA view whenever you need it.'
              )}
            </p>
          </div>

          <div className="rounded-xl border border-nativz-border/80 bg-background/25 p-5 sm:p-6">
            <BrandDNAProgress
              clientId={clientId}
              onComplete={() => router.refresh()}
            />
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
            <Button type="button" variant="outline" size="sm" className="border-nativz-border" onClick={() => router.refresh()}>
              <RefreshCw size={14} />
              Refresh status
            </Button>
            {clientSlug ? (
              <Link
                href={`/admin/clients/${clientSlug}/brand-dna`}
                className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-accent-text transition-colors hover:bg-surface-hover"
              >
                View on client page
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

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
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-text">
              <Sparkles className="h-3.5 w-3.5" />
              Step before ads
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                Build a Brand DNA kit for <span className="text-accent-text">{clientName}</span>
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-text-muted">
                Generate once here — colors, logos, voice, products, and the full guideline stay on this tab.{' '}
                {clientSlug ? (
                  <>
                    Prefer the dedicated view? Open{' '}
                    <Link
                      href={`/admin/clients/${clientSlug}/brand-dna`}
                      className="font-medium text-accent-text underline-offset-2 hover:underline"
                    >
                      Brand DNA on the client page
                    </Link>
                    — it&apos;s the same profile.
                  </>
                ) : (
                  'You can open the same profile from the client page anytime.'
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
                    <p className="text-xs text-text-muted leading-snug">{sub}</p>
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
              <p className="text-xs text-text-muted">
                After status is <span className="text-text-secondary">draft</span> or{' '}
                <span className="text-text-secondary">active</span>, this tab shows the full Brand kit and you can run ads
                from the gallery.
              </p>
            </div>
          </div>
          <div className="relative flex min-h-[200px] items-center justify-center lg:min-h-[280px]">
            <div className="absolute inset-0 rounded-2xl border border-dashed border-nativz-border/60 bg-background/20" />
            <div className="relative flex h-36 w-36 items-center justify-center rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/20 to-accent/5 shadow-[0_0_40px_-12px_rgba(59,130,246,0.5)] sm:h-44 sm:w-44">
              <Dna className="h-14 w-14 text-accent-text" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Brand DNA generation" className="border-t border-nativz-border/60 pt-8 lg:pt-10">
        <OnboardWizard
          open
          layout="inline"
          className="max-w-2xl mx-auto w-full"
          onClose={() => router.refresh()}
          existingClientId={clientId}
          existingClientName={clientName}
          initialWebsiteUrl={websiteUrl}
          onAfterActivate={onBrandDnaActivated}
        />
      </section>
    </div>
  );
}
