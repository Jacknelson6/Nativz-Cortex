'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Loader2, ArrowLeft, Image, LayoutGrid, Sparkles, Dna } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ClientOption } from '@/components/ui/client-picker';
import { AdCreativesStartCommand } from './ad-creatives-start-command';
import { AdCreativesRecentGrid } from './ad-creatives-recent-grid';
import { CreativeGallery } from './creative-gallery';
import { TemplateCatalog } from './template-catalog';
import { AdWizard } from './ad-wizard';
import { BulkTemplateImport } from './bulk-template-import';
import { GenerationBanner } from './generation-banner';
import { FloatingGenerateCreativesButton } from './floating-generate-button';
import { BrandDnaRequiredPanel } from './brand-dna-required-panel';
import { BrandDnaTabReadyPanel } from './brand-dna-tab-ready-panel';
import { Dialog } from '@/components/ui/dialog';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';
import type { AdCreative } from '@/lib/ad-creatives/types';
import type { AdBatchPlaceholderConfig } from '@/lib/ad-creatives/placeholder-config';
import type { RecentClient } from '@/lib/ad-creatives/recent-client';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';
import {
  NATIVZ_BRAND_DNA_UPDATED_EVENT,
  type NativzBrandDnaUpdatedDetail,
} from '@/lib/brand-dna/brand-dna-updated-event';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'gallery' | 'generate' | 'templates';

/** Where ad wizard brand/products came from (shown in UI). */
export type BrandContextSource = 'brand_dna' | 'knowledge_cache' | 'live_scrape';

interface ClientWithSlug extends ClientOption {
  slug: string;
  website_url?: string | null;
  brand_dna_status?: string | null;
}

interface AdCreativesHubProps {
  clients: ClientWithSlug[];
  recentClients?: RecentClient[];
}

const TABS: { key: Tab; label: string; icon: typeof Image }[] = [
  { key: 'gallery', label: 'Gallery', icon: Image },
  { key: 'generate', label: 'Brand DNA', icon: Dna },
  { key: 'templates', label: 'Templates', icon: LayoutGrid },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdCreativesHub({ clients, recentClients = [] }: AdCreativesHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brandRef = useRef<ScrapedBrand | null>(null);
  const brandContextSourceRef = useRef<BrandContextSource | null>(null);
  const clientsRef = useRef(clients);
  clientsRef.current = clients;

  const clearBrandPoll = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearBrandPoll(), [clearBrandPoll]);

  // Context state
  const [startQuery, setStartQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const [brand, setBrand] = useState<ScrapedBrand | null>(null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [brandContextSource, setBrandContextSource] = useState<BrandContextSource | null>(null);

  // Generation state (passed from wizard → gallery)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [placeholderConfig, setPlaceholderConfig] = useState<AdBatchPlaceholderConfig | null>(null);
  const [adWizardOpen, setAdWizardOpen] = useState(false);
  const [wizardSeedCreative, setWizardSeedCreative] = useState<AdCreative | null>(null);

  // Tab state (only shown after context is set)
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);
  const [brandContextRefreshKey, setBrandContextRefreshKey] = useState(0);

  const selectedClient = clients.find((c) => c.id === clientId);
  const hasContext = brand !== null || clientId !== null;
  const isScanning = scanning;

  // Resolve the client ID for API calls
  const resolvedClientId = clientId ?? (brand ? findClientByUrl(clients, brand.url) : null);
  const resolvedClient = resolvedClientId ? clients.find((c) => c.id === resolvedClientId) : null;
  const clientDnaReady =
    !!resolvedClient &&
    (resolvedClient.brand_dna_status === 'active' || resolvedClient.brand_dna_status === 'draft');

  const tabDefault: Tab = !resolvedClientId ? 'generate' : clientDnaReady ? 'gallery' : 'generate';
  const tabParam = searchParams.get('tab') as Tab | null;
  const activeTab: Tab =
    tabParam === 'gallery' || tabParam === 'templates' || tabParam === 'generate' ? tabParam : tabDefault;

  const clientLikelyUsesBrandDna =
    !!selectedClient &&
    (selectedClient.brand_dna_status === 'draft' || selectedClient.brand_dna_status === 'active');

  const setTab = useCallback(
    (tab: Tab, navOpts?: { replace?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      const def: Tab =
        !resolvedClientId ? 'generate' : clientDnaReady ? 'gallery' : 'generate';
      if (tab === def) {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      const url = `${pathname}${qs ? `?${qs}` : ''}`;
      if (navOpts?.replace) {
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
      }
    },
    [router, pathname, searchParams, resolvedClientId, clientDnaReady],
  );

  useEffect(() => {
    brandRef.current = brand;
    brandContextSourceRef.current = brandContextSource;
  }, [brand, brandContextSource]);

  useEffect(() => {
    function onBrandDnaUpdated(e: Event) {
      const d = (e as CustomEvent<NativzBrandDnaUpdatedDetail>).detail;
      if (!d?.clientId) return;
      if (d.clientId === clientId || d.clientId === resolvedClientId) {
        setBrand(null);
        setBrandContextSource(null);
        setBrandContextRefreshKey((k) => k + 1);
      }
    }
    window.addEventListener(NATIVZ_BRAND_DNA_UPDATED_EVENT, onBrandDnaUpdated);
    return () => window.removeEventListener(NATIVZ_BRAND_DNA_UPDATED_EVENT, onBrandDnaUpdated);
  }, [clientId, resolvedClientId]);

  const prevAdWizardOpen = useRef(false);
  useEffect(() => {
    if (adWizardOpen && !prevAdWizardOpen.current) {
      setBrandContextRefreshKey((k) => k + 1);
    }
    prevAdWizardOpen.current = adWizardOpen;
  }, [adWizardOpen]);

  const pollForBrandContext = useCallback(
    (pollClientId: string) => {
      clearBrandPoll();
      pollIntervalRef.current = setInterval(async () => {
        try {
          const params = new URLSearchParams();
          params.set('clientId', pollClientId);
          const res = await fetch(`/api/ad-creatives/crawl-brand?${params.toString()}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.status === 'ready') {
            setBrand((prev) => (data.brand != null ? data.brand : prev));
            setScrapedProducts((prev) =>
              Array.isArray(data.products) && data.products.length > 0 ? data.products : prev,
            );
            if (data.source) setBrandContextSource(data.source as BrandContextSource);
            setScanning(false);
            clearBrandPoll();
          } else if (data.status === 'failed') {
            toast.error(typeof data.error === 'string' ? data.error : 'Brand DNA generation failed');
            setScanning(false);
            clearBrandPoll();
          }
        } catch {
          // Keep polling
        }
      }, 3000);

      pollTimeoutRef.current = setTimeout(() => {
        clearBrandPoll();
        setScanning(false);
        toast.message(
          'Brand DNA is still processing. You can leave this page and come back, or refresh in a few minutes.',
        );
      }, 300_000);
    },
    [clearBrandPoll],
  );

  // ---------------------------------------------------------------------------
  // Scan brand (uses new crawl-brand API with knowledge caching)
  // ---------------------------------------------------------------------------

  async function handleScan(rawOverride?: string) {
    const raw = (rawOverride ?? startQuery).trim();
    const url = normalizeWebsiteUrl(raw);
    if (!url) return;
    if (!isValidWebsiteUrl(url)) {
      toast.error('Enter a valid website (e.g. example.com)');
      return;
    }
    if (url !== raw) setStartQuery(url);

    clearBrandPoll();
    setScanning(true);
    setBrand(null);
    setScrapedProducts([]);
    setBrandContextSource(null);

    try {
      // Use the new crawl-brand endpoint (checks knowledge cache first)
      const res = await fetch('/api/ad-creatives/crawl-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Scan failed');
      }

      const data = await res.json();

      if (data.clientId) {
        const cid = data.clientId as string;
        setClientId(cid);
        const nextParams = new URLSearchParams(searchParams.toString());
        // URL flow creates an ephemeral client — roster may not include it. Use API outcome, not clients[].
        const brandDnaReadyFromApi =
          data.status === 'cached' && data.source === 'brand_dna';
        nextParams.set('tab', brandDnaReadyFromApi ? 'gallery' : 'generate');
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
      }

      if (data.status === 'cached' || data.status === 'ready') {
        setBrand(data.brand ?? null);
        setScrapedProducts(data.products ?? []);
        setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
        setScanning(false);
      } else if (data.status === 'generating') {
        setBrand(data.brand ?? null);
        setScrapedProducts(data.products ?? []);
        setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
        const pollId = (data.clientId as string) ?? null;
        if (pollId) pollForBrandContext(pollId);
        else {
          toast.error('Scan started but client id was missing; try again.');
          setScanning(false);
        }
      } else {
        setScanning(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan website');
      setScanning(false);
    }
  }

  async function handleClientSelect(id: string | null) {
    clearBrandPoll();
    setScanning(false);
    setClientId(id);
    if (!id) return;

    // Clear URL state
    setBrand(null);
    setStartQuery('');
    setScrapedProducts([]);
    setBrandContextSource(null);

    const client = clients.find((c) => c.id === id);
    const dnaReady =
      client?.brand_dna_status === 'active' || client?.brand_dna_status === 'draft';
    const recentWithCreatives = recentClients.some((rc) => rc.clientId === id);

    // Gallery is the workspace for ads; Brand DNA tab when the kit still needs setup.
    // Set tab explicitly so we never inherit the previous client's `?tab=` from search params.
    const nextTab: Tab = recentWithCreatives || dnaReady ? 'gallery' : 'generate';
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('tab', nextTab);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });

    const url = client?.website_url;
    if (!url?.trim()) {
      toast.message(
        "Add a website URL on this client's profile (or finish Brand DNA) to load brand context here.",
      );
    }
  }

  useEffect(() => {
    if (!adWizardOpen || !resolvedClientId) return;

    const client = clientsRef.current.find((c) => c.id === resolvedClientId);
    const url = client?.website_url?.trim();

    let cancelled = false;

    async function loadWizardContext() {
      if (!url) {
        toast.message(
          "Add a website URL on this client's profile (or finish Brand DNA) to load brand context for the wizard.",
        );
        setScanning(false);
        return;
      }

      setScanning(true);
      try {
        const res = await fetch('/api/ad-creatives/crawl-brand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, clientId: resolvedClientId }),
        });

        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          toast.error(typeof data.error === 'string' ? data.error : 'Could not load brand context');
          setScanning(false);
          return;
        }

        if (data.clientId && data.clientId !== resolvedClientId) {
          setClientId(data.clientId as string);
        }

        if (data.status === 'cached' || data.status === 'ready') {
          setBrand(data.brand ?? null);
          setScrapedProducts(data.products ?? []);
          setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
          setScanning(false);
        } else if (data.status === 'generating') {
          setBrand(data.brand ?? null);
          setScrapedProducts(data.products ?? []);
          setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
          pollForBrandContext((data.clientId as string) ?? resolvedClientId);
        } else {
          setScanning(false);
        }
      } catch {
        if (!cancelled) {
          toast.error('Could not load brand context');
          setScanning(false);
        }
      }
    }

    void loadWizardContext();

    return () => {
      cancelled = true;
      clearBrandPoll();
      setScanning(false);
    };
  }, [adWizardOpen, resolvedClientId, brandContextRefreshKey, clearBrandPoll, pollForBrandContext]);

  function handleReset() {
    clearBrandPoll();
    setScanning(false);
    setBrand(null);
    setStartQuery('');
    setScrapedProducts([]);
    setClientId(null);
    setActiveBatchId(null);
    setPlaceholderConfig(null);
    setBrandContextSource(null);
    setAdWizardOpen(false);
    setWizardSeedCreative(null);
    router.replace(pathname, { scroll: false });
  }

  // Called by wizard when generation starts
  function handleGenerationStart(batchId: string, config: AdBatchPlaceholderConfig) {
    setActiveBatchId(batchId);
    setPlaceholderConfig(config);
    setAdWizardOpen(false);
    setWizardSeedCreative(null);
    setTab('gallery', { replace: true });
  }

  const handleCreateMoreLikeThis = useCallback((creative: AdCreative) => {
    setWizardSeedCreative(creative);
    setAdWizardOpen(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Landing — unified search (clients + URL → Brand DNA)
  // ---------------------------------------------------------------------------

  if (!hasContext) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl space-y-8">
          <div className="mx-auto max-w-lg space-y-3 text-center">
            <h1 className="ui-page-title-hero">
              Generate limitless ad creatives
            </h1>
            <p className="text-sm text-text-muted">
              Proven formats from millions in spend — tuned with Brand DNA.
            </p>
          </div>

          <div className="mx-auto w-full max-w-2xl space-y-5">
            <AdCreativesStartCommand
              query={startQuery}
              onQueryChange={setStartQuery}
              clients={clients}
              scanning={scanning}
              onSubmitUrl={(raw) => void handleScan(raw)}
              onSelectClient={(id) => void handleClientSelect(id)}
            />
            <AdCreativesRecentGrid
              recentClients={recentClients}
              clients={clients}
              disabled={scanning}
              onSelectClient={(id) => void handleClientSelect(id)}
            />
          </div>

          {scanning && (
            <div className="flex items-center justify-center gap-3 py-2">
              <Loader2 size={20} className="animate-spin text-accent-text" />
              <p className="max-w-sm text-center text-sm text-text-muted">Building your brand kit…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Active state — wizard + gallery + templates
  // ---------------------------------------------------------------------------

  return (
    <div className="cortex-page-gutter max-w-7xl mx-auto space-y-8">
      {/* Sticky glass navbar: wayfinding + tabs + gallery CTA (no floating bottom chat bar) */}
      <div className="sticky top-0 z-40 -mx-6 sm:-mx-8 px-6 sm:px-8 pt-1 pb-2">
        <div className="rounded-2xl border border-white/[0.1] bg-surface/65 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.65)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/55">
          <div className="flex flex-col gap-3 p-3 sm:p-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
                <button
                  type="button"
                  onClick={handleReset}
                  aria-label="Start over — pick a different website or client"
                  className="mt-0.5 shrink-0 text-text-muted transition-colors hover:text-text-secondary cursor-pointer rounded-lg p-1 -m-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:mt-0"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                    Ad creatives
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h1 className="truncate ui-section-title sm:text-xl">
                      {brand?.name ?? selectedClient?.name ?? 'Unknown brand'}
                    </h1>
                    {brand && (
                      <div className="flex items-center gap-1">
                        {brand.colors.slice(0, 4).map((color, i) => (
                          <div
                            key={`${color}-${i}`}
                            className="h-3.5 w-3.5 rounded-full border border-white/10 sm:h-4 sm:w-4"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    {brandContextSource === 'brand_dna' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent-text">
                        <Sparkles size={10} />
                        Brand DNA
                      </span>
                    )}
                    {brandContextSource === 'knowledge_cache' && (
                      <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-text-muted">
                        Cached crawl
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {activeTab === 'gallery' && resolvedClientId && !clientDnaReady && (
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

      {/* In-flight batch notice — hidden on gallery (skeleton grid shows progress). */}
      {resolvedClientId && activeTab !== 'gallery' && <GenerationBanner clientId={resolvedClientId} />}

      {/* Crawl / DNA poll notice — only on gallery or templates; Brand DNA tab has its own panels, and a saved kit makes this copy redundant */}
      {resolvedClientId &&
        isScanning &&
        activeTab !== 'generate' &&
        !clientDnaReady && (
          <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/[0.06] px-4 py-3 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-text" />
            <div>
              <p className="font-medium text-text-primary">
                {clientLikelyUsesBrandDna
                  ? 'Loading brand from Brand DNA…'
                  : 'Running Brand DNA on your site…'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                When it&apos;s ready, open the gallery to generate ads.
              </p>
            </div>
          </div>
        )}

      {/* Bulk import panel */}
      {showBulkImport && activeTab === 'templates' && (
        <div className="rounded-xl bg-surface border border-nativz-border p-5">
          <BulkTemplateImport
            clientId={resolvedClientId ?? ''}
            onClose={() => setShowBulkImport(false)}
            onImportComplete={() => setTemplateRefreshKey((k) => k + 1)}
          />
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'generate' && resolvedClientId && !clientDnaReady && resolvedClient && (
        <BrandDnaRequiredPanel
          clientId={resolvedClientId}
          clientName={resolvedClient.name ?? ''}
          brandDnaStatus={resolvedClient.brand_dna_status}
          websiteUrl={resolvedClient.website_url}
          clientSlug={resolvedClient.slug}
          onBrandDnaActivated={() => setTab('generate', { replace: true })}
        />
      )}
      {activeTab === 'generate' && resolvedClientId && clientDnaReady && resolvedClient && (
        <BrandDnaTabReadyPanel
          clientId={resolvedClientId}
          clientName={resolvedClient.name ?? 'Client'}
          clientSlug={resolvedClient.slug}
          websiteUrl={resolvedClient.website_url}
          brandDnaStatus={resolvedClient.brand_dna_status}
          onOpenGallery={() => setTab('gallery')}
        />
      )}
      {activeTab === 'generate' && !resolvedClientId && (
        <div className="rounded-2xl border border-nativz-border bg-surface p-10 text-center space-y-2 max-w-lg mx-auto">
          <p className="text-sm font-medium text-text-primary">Client not linked yet</p>
          <p className="text-xs text-text-muted leading-relaxed">
            We could not resolve a saved client for this session. Go back, run the scan again, or choose an existing
            client from the roster.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={handleReset}>
            Start over
          </Button>
        </div>
      )}
      {activeTab === 'gallery' && resolvedClientId && (
        <CreativeGallery
          clientId={resolvedClientId}
          brandDnaReady={clientDnaReady}
          activeBatchId={activeBatchId}
          placeholderConfig={placeholderConfig}
          onBatchComplete={() => {
            setActiveBatchId(null);
            setPlaceholderConfig(null);
          }}
          onCreateMoreLikeThis={clientDnaReady ? handleCreateMoreLikeThis : undefined}
        />
      )}

      <FloatingGenerateCreativesButton
        visible={activeTab === 'gallery' && !!resolvedClientId && clientDnaReady}
        onClick={() => setAdWizardOpen(true)}
      />
      {activeTab === 'gallery' && !resolvedClientId && (
        <div className="rounded-xl border border-nativz-border bg-surface p-12 text-center">
          <p className="text-sm text-text-muted">Gallery is available for saved clients. Generated ads will appear here.</p>
        </div>
      )}
      {activeTab === 'templates' && (
        <TemplateCatalog
          clientId={resolvedClientId ?? ''}
          onShowBulkImport={() => setShowBulkImport(true)}
          refreshKey={templateRefreshKey}
        />
      )}

      <Dialog
        open={adWizardOpen && !!resolvedClientId}
        onClose={() => {
          clearBrandPoll();
          setScanning(false);
          setAdWizardOpen(false);
          setWizardSeedCreative(null);
        }}
        maxWidth="full"
        className="max-h-[min(92vh,940px)] sm:max-w-6xl"
        bodyClassName="flex max-h-[min(92vh,940px)] flex-col overflow-hidden p-0"
      >
        <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {isScanning || !brand ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
              <Loader2 size={28} className="animate-spin text-accent-text" />
              <p className="text-sm text-text-muted text-center max-w-xs">
                Loading brand context for the wizard…
              </p>
            </div>
          ) : (
            <AdWizard
              clientId={resolvedClientId!}
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findClientByUrl(clients: ClientWithSlug[], url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const slug = hostname.split('.')[0];
    const match = clients.find((c) => c.slug === slug);
    return match?.id ?? null;
  } catch {
    return null;
  }
}
