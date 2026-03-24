'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowLeft, Dna, Image, LayoutGrid, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CreativeGallery } from './creative-gallery';
import { TemplateCatalog } from './template-catalog';
import { AdWizard } from './ad-wizard';
import { BulkTemplateImport } from './bulk-template-import';
import { BrandDnaRequiredPanel } from './brand-dna-required-panel';
import { BrandDnaTabReadyPanel } from './brand-dna-tab-ready-panel';
import { FloatingGenerateCreativesButton } from './floating-generate-button';
import { Dialog } from '@/components/ui/dialog';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';
import type { AdCreative } from '@/lib/ad-creatives/types';
import type { AdBatchPlaceholderConfig } from '@/lib/ad-creatives/placeholder-config';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';
import { useClientAdminShell } from '@/components/clients/client-admin-shell-context';
import {
  NATIVZ_BRAND_DNA_UPDATED_EVENT,
  type NativzBrandDnaUpdatedDetail,
} from '@/lib/brand-dna/brand-dna-updated-event';

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
  const [brandContextSource, setBrandContextSource] = useState<BrandContextSource | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSeedCreative, setWizardSeedCreative] = useState<AdCreative | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [placeholderConfig, setPlaceholderConfig] = useState<AdBatchPlaceholderConfig | null>(null);
  /** Bumps when Brand DNA is saved elsewhere or the generate wizard opens — refetch crawl-brand from DB. */
  const [brandContextRefreshKey, setBrandContextRefreshKey] = useState(0);

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
    function onBrandDnaUpdated(e: Event) {
      const d = (e as CustomEvent<NativzBrandDnaUpdatedDetail>).detail;
      if (d?.clientId === clientId) {
        setBrandContextRefreshKey((k) => k + 1);
      }
    }
    window.addEventListener(NATIVZ_BRAND_DNA_UPDATED_EVENT, onBrandDnaUpdated);
    return () => window.removeEventListener(NATIVZ_BRAND_DNA_UPDATED_EVENT, onBrandDnaUpdated);
  }, [clientId]);

  const prevWizardOpen = useRef(false);
  useEffect(() => {
    if (wizardOpen && !prevWizardOpen.current) {
      setBrandContextRefreshKey((k) => k + 1);
    }
    prevWizardOpen.current = wizardOpen;
  }, [wizardOpen]);

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
  }, [shouldLoadWizardContext, clientId, websiteUrl, brandContextRefreshKey, pollForBrandContext, clearPoll]);

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
    (batchId: string, config: AdBatchPlaceholderConfig) => {
      setActiveBatchId(batchId);
      setPlaceholderConfig(config);
      setWizardOpen(false);
      setWizardSeedCreative(null);
      setTab('gallery');
    },
    [setTab],
  );

  const handleCreateMoreLikeThis = useCallback((creative: AdCreative) => {
    setWizardSeedCreative(creative);
    setWizardOpen(true);
  }, []);

  return (
    <div className="cortex-page-gutter max-w-7xl mx-auto space-y-8">
      <div className="sticky top-0 z-40 -mx-6 sm:-mx-8 px-6 sm:px-8 pt-1 pb-2">
        <div className="rounded-2xl border border-white/[0.1] bg-surface/65 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.65)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/55">
          <div className="flex flex-col gap-3 p-3 sm:p-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                {!shell && (
                  <Link
                    href={`/admin/clients/${clientSlug}`}
                    aria-label="Back to client profile"
                    className="mt-0.5 shrink-0 text-text-muted transition-colors hover:text-text-secondary rounded-lg p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:mt-0"
                  >
                    <ArrowLeft size={20} />
                  </Link>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                    Ad creatives
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <h1 className="truncate ui-section-title sm:text-xl">
                      {clientName}
                    </h1>
                    {creativeCount > 0 && (
                      <span className="shrink-0 text-[10px] text-text-muted rounded-full border border-white/10 bg-background/30 px-2 py-0.5 backdrop-blur-sm">
                        {creativeCount} {creativeCount === 1 ? 'creative' : 'creatives'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {activeTab === 'gallery' && !brandDnaReady && (
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  <Button
                    type="button"
                    variant="outline"
                    shape="pill"
                    className="w-full border-white/15 bg-background/30 backdrop-blur-sm sm:w-auto"
                    onClick={() => setTab('generate')}
                  >
                    <Dna size={16} />
                    Finish brand kit
                  </Button>
                </div>
              )}
            </div>

            <div
              className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.06] bg-background/25 p-1 backdrop-blur-sm"
              role="tablist"
              aria-label="Ad creatives sections"
            >
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === key}
                  onClick={() => setTab(key)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all cursor-pointer sm:px-4 sm:text-sm ${
                    activeTab === key
                      ? 'bg-accent/[0.16] text-accent-text shadow-sm ring-1 ring-accent/20'
                      : 'text-text-muted hover:bg-background/40 hover:text-text-secondary'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
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
          activeBatchId={activeBatchId}
          placeholderConfig={placeholderConfig}
          onBatchComplete={() => {
            setActiveBatchId(null);
            setPlaceholderConfig(null);
          }}
          onCreateMoreLikeThis={brandDnaReady ? handleCreateMoreLikeThis : undefined}
        />
      )}

      <FloatingGenerateCreativesButton
        visible={activeTab === 'gallery' && brandDnaReady}
        onClick={() => setWizardOpen(true)}
      />

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
          clientSlug={clientSlug}
          onBrandDnaActivated={() => setTab('generate')}
        />
      )}

      {activeTab === 'generate' && brandDnaReady && (
        <BrandDnaTabReadyPanel
          clientId={clientId}
          clientName={clientName}
          clientSlug={clientSlug}
          websiteUrl={websiteUrl}
          brandDnaStatus={brandDnaStatus}
          onOpenGallery={() => setTab('gallery')}
        />
      )}

      <Dialog
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setWizardSeedCreative(null);
        }}
        maxWidth="full"
        className="max-h-[min(92vh,940px)] sm:max-w-6xl"
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
              initialBrand={brand ?? undefined}
              initialProducts={scrapedProducts}
              brandContextSource={brandContextSource ?? undefined}
              seedCreative={wizardSeedCreative}
              onGenerationStart={handleGenerationStart}
            />
          )}
        </div>
      </Dialog>
    </div>
  );
}
