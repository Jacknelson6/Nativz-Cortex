'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowLeft, Dna, Image, LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { CreativeGallery } from './creative-gallery';
import { TemplateCatalog } from './template-catalog';
import { AdWizard } from './ad-wizard';
import { BulkTemplateImport } from './bulk-template-import';
import { BrandDnaRequiredPanel } from './brand-dna-required-panel';
import { BrandDnaTabReadyPanel } from './brand-dna-tab-ready-panel';
import { Dialog } from '@/components/ui/dialog';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';
import { useClientAdminShell } from '@/components/clients/client-admin-shell-context';

type BrandContextSource = 'brand_dna' | 'knowledge_cache' | 'live_scrape';

type Tab = 'gallery' | 'templates' | 'generate';

const TABS: { key: Tab; label: string; icon: typeof Image }[] = [
  { key: 'gallery', label: 'Gallery', icon: Image },
  { key: 'generate', label: 'Brand DNA', icon: Dna },
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

type PlaceholderConfig = {
  brandColors: string[];
  templateThumbnails: { templateId: string; imageUrl: string; variationIndex: number }[];
};

export function AdCreativesView({
  clientId,
  clientName,
  clientSlug,
  websiteUrl,
  brandDnaStatus,
  creativeCount,
}: AdCreativesViewProps) {
  const shell = useClientAdminShell();
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

  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [placeholderConfig, setPlaceholderConfig] = useState<PlaceholderConfig | null>(null);

  const tabParam = searchParams.get('tab') as Tab | null;
  const brandDnaReady = brandDnaStatus === 'active' || brandDnaStatus === 'draft';
  const defaultTab: Tab = brandDnaReady ? 'gallery' : 'generate';
  const activeTab: Tab =
    tabParam === 'gallery' || tabParam === 'templates' || tabParam === 'generate' ? tabParam : defaultTab;

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

  const shouldLoadWizardContext = brandDnaReady && (activeTab === 'gallery' || wizardOpen);

  useEffect(() => {
    if (!shouldLoadWizardContext) {
      clearPoll();
      if (!wizardOpen) {
        setContextLoading(false);
      }
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
  }, [shouldLoadWizardContext, clientId, websiteUrl, pollForBrandContext, clearPoll]);

  const setTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === defaultTab) {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams, defaultTab],
  );

  const handleGenerationStart = useCallback(
    (batchId: string, config: PlaceholderConfig) => {
      setActiveBatchId(batchId);
      setPlaceholderConfig(config);
      setWizardOpen(false);
      setTab('gallery');
    },
    [setTab],
  );

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!shell && (
            <Link
              href={`/admin/clients/${clientSlug}`}
              aria-label="Back to client profile"
              className="text-text-muted hover:text-text-secondary transition-colors rounded-lg p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <ArrowLeft size={20} />
            </Link>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted mb-1">Content</p>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Ad creatives</h1>
            <p className="text-sm text-text-muted mt-0.5">{clientName}</p>
          </div>
          {creativeCount > 0 && (
            <span className="text-[11px] text-text-muted rounded-full bg-background border border-nativz-border px-2 py-0.5">
              {creativeCount} {creativeCount === 1 ? 'creative' : 'creatives'}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-nativz-border/80 bg-surface/90 p-1 w-fit shadow-sm backdrop-blur-sm">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
              activeTab === key
                ? 'bg-accent/[0.14] text-accent-text shadow-sm ring-1 ring-accent/25'
                : 'text-text-muted hover:text-text-secondary hover:bg-background/50'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {showBulkImport && activeTab === 'templates' && (
        <div className="rounded-xl bg-surface border border-nativz-border p-5">
          <BulkTemplateImport
            clientId={clientId}
            onClose={() => setShowBulkImport(false)}
            onImportComplete={() => setTemplateRefreshKey((k) => k + 1)}
          />
        </div>
      )}

      {activeTab === 'gallery' && (
        <CreativeGallery
          clientId={clientId}
          brandDnaReady={brandDnaReady}
          onOpenAdWizard={() => setWizardOpen(true)}
          onGoToBrandKit={() => setTab('generate')}
          activeBatchId={activeBatchId}
          placeholderConfig={placeholderConfig}
          onBatchComplete={() => {
            setActiveBatchId(null);
            setPlaceholderConfig(null);
          }}
        />
      )}

      {activeTab === 'templates' && (
        <TemplateCatalog
          clientId={clientId}
          onShowBulkImport={() => setShowBulkImport(true)}
          refreshKey={templateRefreshKey}
        />
      )}

      {activeTab === 'generate' && !brandDnaReady && (
        <BrandDnaRequiredPanel
          clientId={clientId}
          clientName={clientName}
          brandDnaStatus={brandDnaStatus}
          websiteUrl={websiteUrl}
        />
      )}

      {activeTab === 'generate' && brandDnaReady && (
        <BrandDnaTabReadyPanel
          clientName={clientName}
          clientSlug={clientSlug}
          onOpenGallery={() => setTab('gallery')}
        />
      )}

      <Dialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        maxWidth="full"
        className="max-h-[min(92vh,940px)] sm:max-w-[min(96vw,1440px)]"
        bodyClassName="flex max-h-[min(92vh,940px)] flex-col overflow-hidden p-0"
      >
        <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {contextLoading || !brand ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
              <Loader2 size={28} className="animate-spin text-accent-text" />
              <p className="text-sm text-text-muted text-center max-w-xs">
                Loading brand context for the wizard…
              </p>
            </div>
          ) : (
            <AdWizard
              clientId={clientId}
              clientSlug={clientSlug}
              initialBrand={brand ?? undefined}
              initialProducts={scrapedProducts}
              initialMediaUrls={mediaUrls}
              brandContextSource={brandContextSource ?? undefined}
              onGenerationStart={handleGenerationStart}
            />
          )}
        </div>
      </Dialog>
    </div>
  );
}
