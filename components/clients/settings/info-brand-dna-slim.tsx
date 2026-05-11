'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles, ArrowUpRight, Loader2 } from 'lucide-react';
import { InfoCard } from './info-card';

/** Mirrors `clients.brand_dna_status`. Loose `string` fallback covers any
 *  future statuses we haven't enumerated yet. */
export type BrandDnaStatus = 'none' | 'queued' | 'generating' | 'generated' | string;

export type BrandDnaColor = { hex: string; name?: string | null; role?: string | null };
export type BrandDnaLogo = { url: string; variant?: string | null };
export type BrandDnaFont = { family: string; role?: string | null };

/**
 * InfoBrandDnaSlim — Brand DNA preview on the info page. Shows the visual
 * essentials extracted from the client's website: color swatches, primary
 * logo, and typeface families. The deep editor still lives on
 * /admin/clients/[slug]/settings/brand; this card is read-first with a
 * regenerate button that re-scrapes the saved website URL.
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
  colors = [],
  logos = [],
  fonts = [],
}: {
  clientId: string;
  websiteUrl: string | null;
  brandDnaStatus: BrandDnaStatus;
  brandDnaUpdatedAt: string | null;
  brandProfileHref?: string;
  colors?: BrandDnaColor[];
  logos?: BrandDnaLogo[];
  fonts?: BrandDnaFont[];
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
      <div className="space-y-5">
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
                  Will read <span className="font-mono text-text-secondary">{cleanDomain(websiteUrl)}</span> and pull colors, logo, and fonts.
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

        {hasDna && (colors.length > 0 || logos.length > 0 || fonts.length > 0) && (
          <div className="grid gap-5 sm:grid-cols-3">
            <DnaLogo logos={logos} />
            <DnaColors colors={colors} />
            <DnaFonts fonts={fonts} />
          </div>
        )}
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

function DnaSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
      {children}
    </span>
  );
}

function DnaLogo({ logos }: { logos: BrandDnaLogo[] }) {
  const primary = logos.find((l) => (l.variant ?? '').toLowerCase().includes('primary')) ?? logos[0];
  return (
    <div>
      <DnaSectionLabel>Logo</DnaSectionLabel>
      <div className="mt-2 flex h-20 items-center justify-center rounded-lg border border-nativz-border bg-background p-3">
        {primary?.url ? (
          <Image
            src={primary.url}
            alt="Brand logo"
            width={120}
            height={48}
            className="max-h-14 w-auto object-contain"
            unoptimized
          />
        ) : (
          <span className="text-[11px] italic text-text-muted">No logo</span>
        )}
      </div>
    </div>
  );
}

function DnaColors({ colors }: { colors: BrandDnaColor[] }) {
  const shown = colors.slice(0, 8);
  return (
    <div>
      <DnaSectionLabel>Colors</DnaSectionLabel>
      <div className="mt-2 flex h-20 flex-wrap content-start gap-1.5 rounded-lg border border-nativz-border bg-background p-3">
        {shown.length === 0 && (
          <span className="text-[11px] italic text-text-muted">None pulled</span>
        )}
        {shown.map((c) => (
          <span
            key={c.hex}
            title={c.name ?? c.hex}
            className="inline-flex h-6 w-6 rounded-md border border-nativz-border shadow-sm"
            style={{ backgroundColor: c.hex }}
            aria-label={c.name ?? c.hex}
          />
        ))}
      </div>
    </div>
  );
}

function DnaFonts({ fonts }: { fonts: BrandDnaFont[] }) {
  const families = dedupeFamilies(fonts).slice(0, 4);
  return (
    <div>
      <DnaSectionLabel>Fonts</DnaSectionLabel>
      <div className="mt-2 flex h-20 flex-col justify-center gap-1 rounded-lg border border-nativz-border bg-background p-3">
        {families.length === 0 ? (
          <span className="text-[11px] italic text-text-muted">None pulled</span>
        ) : (
          families.map((f) => (
            <span
              key={f.family}
              className="truncate text-sm text-text-primary"
              style={{ fontFamily: `'${f.family}', sans-serif` }}
            >
              {f.family}
              {f.role ? (
                <span className="ml-2 text-[11px] text-text-muted">{f.role}</span>
              ) : null}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function dedupeFamilies(fonts: BrandDnaFont[]): BrandDnaFont[] {
  const seen = new Set<string>();
  const out: BrandDnaFont[] = [];
  for (const f of fonts) {
    const key = f.family.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
