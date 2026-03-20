'use client';

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowLeft, Image, LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CreativeGallery } from './creative-gallery';
import { TemplateCatalog } from './template-catalog';
import { AdWizard } from './ad-wizard';
import { BulkTemplateImport } from './bulk-template-import';
import { BrandDnaRequiredPanel } from './brand-dna-required-panel';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';

type BrandContextSource = 'brand_dna' | 'knowledge_cache' | 'live_scrape';

type Tab = 'gallery' | 'templates' | 'generate';

const TABS: { key: Tab; label: string; icon: typeof Image }[] = [
  { key: 'generate', label: 'Generate', icon: Sparkles },
  { key: 'gallery', label: 'Gallery', icon: Image },
  { key: 'templates', label: 'Templates', icon: LayoutGrid },
];

interface AdCreativesViewProps {
  clientId: string;
  clientName: string;
  clientSlug: string;
  /** Client profile website; optional — crawl-brand can fall back from DB when omitted. */
  websiteUrl?: string | null;
  brandDnaStatus?: string | null;
  creativeCount: number;
}

export function AdCreativesView({
  clientId,
  clientName,
  clientSlug,
  websiteUrl,
  brandDnaStatus,
  creativeCount,
}: AdCreativesViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);

  const [brand, setBrand] = useState<ScrapedBrand | null>(null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [brandContextSource, setBrandContextSource] = useState<BrandContextSource | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tabParam = searchParams.get('tab') as Tab | null;
  const activeTab: Tab =
    tabParam === 'gallery' || tabParam === 'templates' || tabParam === 'generate'
      ? tabParam
      : 'generate';

  const brandDnaReady =
    brandDnaStatus === 'active' || brandDnaStatus === 'draft';

  useLayoutEffect(() => {
    if (activeTab === 'generate' && brandDnaReady) {
      setContextLoading(true);
    }
  }, [activeTab, brandDnaReady]);

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollForBrandContext = useCallback(() => {
    clearPoll();
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ad-creatives/crawl-brand?clientId=${encodeURIComponent(clientId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'ready') {
          setBrand(data.brand ?? null);
          setScrapedProducts(data.products ?? []);
          setMediaUrls(data.mediaUrls ?? []);
          setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
          setContextLoading(false);
          clearPoll();
        } else if (data.status === 'failed') {
          toast.error(typeof data.error === 'string' ? data.error : 'Brand DNA generation failed');
          setContextLoading(false);
          clearPoll();
        }
      } catch {
        // Keep polling
      }
    }, 3000);

    setTimeout(() => {
      clearPoll();
      setContextLoading(false);
    }, 300_000);
  }, [clientId, clearPoll]);

  useEffect(() => {
    if (activeTab !== 'generate') {
      clearPoll();
      setContextLoading(false);
      return;
    }
    if (!brandDnaReady) {
      clearPoll();
      setContextLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setContextLoading(true);
      setBrand(null);
      setScrapedProducts([]);
      setMediaUrls([]);
      setBrandContextSource(null);

      const normalized = normalizeWebsiteUrl(websiteUrl ?? '');
      const body: { clientId: string; url?: string } = { clientId };
      if (isValidWebsiteUrl(normalized)) body.url = normalized;

      try {
        const res = await fetch('/api/ad-creatives/crawl-brand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            toast.error(typeof data.error === 'string' ? data.error : 'Could not load brand context');
            setContextLoading(false);
          }
          return;
        }

        if (cancelled) return;

        if (data.status === 'cached' || data.status === 'ready') {
          setBrand(data.brand ?? null);
          setScrapedProducts(data.products ?? []);
          setMediaUrls(data.mediaUrls ?? []);
          setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
          setContextLoading(false);
        } else if (data.status === 'generating' || data.status === 'crawling') {
          pollForBrandContext();
        } else {
          setContextLoading(false);
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not load brand context');
          setContextLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [activeTab, brandDnaReady, clientId, websiteUrl, pollForBrandContext, clearPoll]);

  const setTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'generate') {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/clients/${clientSlug}`}
            aria-label="Back to client profile"
            className="text-text-muted hover:text-text-secondary transition-colors rounded-lg p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Ad creatives</h1>
            <p className="text-sm text-text-muted">{clientName}</p>
          </div>
          {creativeCount > 0 && (
            <span className="text-[11px] text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5">
              {creativeCount} {creativeCount === 1 ? 'creative' : 'creatives'}
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-surface rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
              activeTab === key
                ? 'bg-background text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Bulk import panel */}
      {showBulkImport && activeTab === 'templates' && (
        <div className="rounded-xl bg-surface border border-nativz-border p-5">
          <BulkTemplateImport
            clientId={clientId}
            onClose={() => setShowBulkImport(false)}
            onImportComplete={() => setTemplateRefreshKey((k) => k + 1)}
          />
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'gallery' && (
        <CreativeGallery clientId={clientId} onNavigateToGenerate={() => setTab('generate')} />
      )}
      {activeTab === 'templates' && (
        <TemplateCatalog
          clientId={clientId}
          onShowBulkImport={() => setShowBulkImport(true)}
          refreshKey={templateRefreshKey}
        />
      )}
      {activeTab === 'generate' && contextLoading && (
        <div className="rounded-2xl border border-nativz-border bg-surface p-12 flex flex-col items-center justify-center gap-4">
          <Loader2 size={28} className="animate-spin text-accent-text" />
          <div className="text-center max-w-md">
            <p className="text-sm font-medium text-text-primary">Loading brand & products…</p>
            <p className="text-xs text-text-muted mt-1">
              Using Brand DNA and site context when available. This can take a moment on first crawl.
            </p>
          </div>
        </div>
      )}
      {activeTab === 'generate' && !brandDnaReady && !contextLoading && (
        <BrandDnaRequiredPanel
          clientId={clientId}
          clientName={clientName}
          brandDnaStatus={brandDnaStatus}
          websiteUrl={websiteUrl}
        />
      )}
      {activeTab === 'generate' && brandDnaReady && !contextLoading && (
        <AdWizard
          clientId={clientId}
          clientSlug={clientSlug}
          initialBrand={brand ?? undefined}
          initialProducts={scrapedProducts}
          initialMediaUrls={mediaUrls}
          brandContextSource={brandContextSource ?? undefined}
        />
      )}
    </div>
  );
}
