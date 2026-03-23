'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Globe,
  Loader2,
  Search,
  Building2,
  ArrowLeft,
  Image,
  LayoutGrid,
  Sparkles,
  Dna,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ClientOption } from '@/components/ui/client-picker';
import { AdCreativesClientPick } from './ad-creatives-client-pick';
import { CreativeGallery } from './creative-gallery';
import { TemplateCatalog } from './template-catalog';
import { AdWizard } from './ad-wizard';
import { BulkTemplateImport } from './bulk-template-import';
import { GenerationBanner } from './generation-banner';
import { BrandDnaRequiredPanel } from './brand-dna-required-panel';
import { BrandDnaTabReadyPanel } from './brand-dna-tab-ready-panel';
import { Dialog } from '@/components/ui/dialog';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';
import type { RecentClient } from '@/app/admin/ad-creatives/page';
import { normalizeWebsiteUrl, isValidWebsiteUrl } from '@/lib/utils/normalize-website-url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContextMode = 'url' | 'client';
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

interface PlaceholderConfig {
  brandColors: string[];
  templateThumbnails: { templateId: string; imageUrl: string; variationIndex: number }[];
}

const TABS: { key: Tab; label: string; icon: typeof Image }[] = [
  { key: 'gallery', label: 'Gallery', icon: Image },
  { key: 'generate', label: 'Brand DNA', icon: Dna },
  { key: 'templates', label: 'Templates', icon: LayoutGrid },
];

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------

function useAnimatedCounter(target: number, duration: number = 3000) {
  // Avoid a first-paint "0+" flash before the effect runs.
  const [value, setValue] = useState(1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const steps = [1, 10, 50, 100, 500, 1000, 2500, 5000, 7500, target];
    const stepDuration = duration / steps.length;
    let i = 0;

    function tick() {
      if (i < steps.length) {
        setValue(steps[i]);
        i++;
        rafRef.current = window.setTimeout(tick, stepDuration) as unknown as number;
      }
    }

    tick();
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdCreativesHub({ clients, recentClients = [] }: AdCreativesHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [contextMode, setContextMode] = useState<ContextMode>('url');
  const [brandUrl, setBrandUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [brand, setBrand] = useState<ScrapedBrand | null>(null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [brandContextSource, setBrandContextSource] = useState<BrandContextSource | null>(null);

  // Generation state (passed from wizard → gallery)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [placeholderConfig, setPlaceholderConfig] = useState<PlaceholderConfig | null>(null);
  const [adWizardOpen, setAdWizardOpen] = useState(false);

  // Tab state (only shown after context is set)
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);

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

  const counter = useAnimatedCounter(10000);

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

  // ---------------------------------------------------------------------------
  // Scan brand (uses new crawl-brand API with knowledge caching)
  // ---------------------------------------------------------------------------

  async function handleScan() {
    const url = normalizeWebsiteUrl(brandUrl);
    if (!url) return;
    if (!isValidWebsiteUrl(url)) {
      toast.error('Enter a valid website (e.g. example.com)');
      return;
    }
    if (url !== brandUrl.trim()) setBrandUrl(url);

    clearBrandPoll();
    setScanning(true);
    setBrand(null);
    setScrapedProducts([]);
    setMediaUrls([]);
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
        const c = clients.find((x) => x.id === cid);
        const dna =
          c?.brand_dna_status === 'active' || c?.brand_dna_status === 'draft';
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.set('tab', dna ? 'gallery' : 'generate');
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
      }

      if (data.status === 'cached' || data.status === 'ready') {
        setBrand(data.brand ?? null);
        setScrapedProducts(data.products ?? []);
        setMediaUrls(data.mediaUrls ?? []);
        setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
        setScanning(false);
      } else if (data.status === 'generating') {
        setBrand(data.brand ?? null);
        setScrapedProducts(data.products ?? []);
        setMediaUrls(data.mediaUrls ?? []);
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
    setClientId(id);
    if (!id) return;

    // Clear URL state
    setBrand(null);
    setBrandUrl('');
    setScrapedProducts([]);
    setMediaUrls([]);
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

    // Auto-scan client's website URL for brand context
    const url = client?.website_url;
    if (!url?.trim()) {
      toast.message(
        "Add a website URL on this client's profile (or finish Brand DNA) to load brand context here.",
      );
      return;
    }

    setScanning(true);
    try {
      const res = await fetch('/api/ad-creatives/crawl-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, clientId: id }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not load brand context');
        setScanning(false);
        return;
      }

      if (data.clientId && data.clientId !== id) setClientId(data.clientId as string);

      if (data.status === 'cached' || data.status === 'ready') {
        setBrand(data.brand ?? null);
        setScrapedProducts(data.products ?? []);
        setMediaUrls(data.mediaUrls ?? []);
        setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
        setScanning(false);
      } else if (data.status === 'generating') {
        setBrand(data.brand ?? null);
        setScrapedProducts(data.products ?? []);
        setMediaUrls(data.mediaUrls ?? []);
        setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
        pollForBrandContext((data.clientId as string) ?? id);
      } else {
        setScanning(false);
      }
    } catch {
      toast.error('Could not load brand context');
      setScanning(false);
    }
  }

  function pollForBrandContext(pollClientId: string) {
    clearBrandPoll();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        params.set('clientId', pollClientId);
        const res = await fetch(`/api/ad-creatives/crawl-brand?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'ready') {
          setBrand(data.brand ?? null);
          setScrapedProducts(data.products ?? []);
          setMediaUrls(data.mediaUrls ?? []);
          setBrandContextSource((data.source as BrandContextSource) ?? 'live_scrape');
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
      toast.message('Brand DNA is still processing. You can leave this page and come back, or refresh in a few minutes.');
    }, 300_000);
  }

  function handleReset() {
    clearBrandPoll();
    setBrand(null);
    setBrandUrl('');
    setScrapedProducts([]);
    setMediaUrls([]);
    setClientId(null);
    setActiveBatchId(null);
    setPlaceholderConfig(null);
    setBrandContextSource(null);
    setAdWizardOpen(false);
    router.replace(pathname, { scroll: false });
  }

  function handleRecentClientClick(rc: RecentClient) {
    void handleClientSelect(rc.clientId);
  }

  // Called by wizard when generation starts
  function handleGenerationStart(batchId: string, config: PlaceholderConfig) {
    setActiveBatchId(batchId);
    setPlaceholderConfig(config);
    setAdWizardOpen(false);
    setTab('gallery', { replace: true });
  }

  // ---------------------------------------------------------------------------
  // Landing — URL or client picker
  // ---------------------------------------------------------------------------

  if (!hasContext) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6">
        <div className="w-full max-w-xl space-y-8">
          {/* Header with animated counter */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-text-primary">
              Generate limitless ad creatives
            </h1>
            <p className="text-text-muted">
              <span className="text-accent-text font-semibold tabular-nums">
                {counter.toLocaleString()}+
              </span>{' '}
              variations from a single brand scan.
            </p>
          </div>

          {/* Context mode toggle */}
          <div className="flex items-center gap-1 bg-surface rounded-xl p-1 mx-auto w-fit">
            {([
              { mode: 'url' as const, icon: Globe, label: 'Website URL' },
              { mode: 'client' as const, icon: Building2, label: 'Existing client' },
            ] as const).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setContextMode(mode)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                  contextMode === mode
                    ? 'bg-background text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* URL input */}
          {contextMode === 'url' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="url"
                    value={brandUrl}
                    onChange={(e) => setBrandUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                    placeholder="yourwebsite.com"
                    className="w-full rounded-xl border border-nativz-border bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/35"
                    disabled={scanning}
                    autoFocus
                  />
                </div>
                <Button
                  size="lg"
                  onClick={handleScan}
                  disabled={scanning || !brandUrl.trim()}
                >
                  {scanning ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                </Button>
              </div>

              {scanning && (
                <div className="flex items-center justify-center gap-3 py-6">
                  <Loader2 size={20} className="animate-spin text-accent-text" />
                  <p className="text-sm text-text-muted">Scanning website for brand & products…</p>
                </div>
              )}

              <p className="text-xs text-text-muted text-center">
                We&apos;ll crawl your entire website for brand assets, colors, and products.
              </p>
            </div>
          )}

          {/* Client picker — rich grid + recents (URL mode keeps its own layout above) */}
          {contextMode === 'client' && (
            <AdCreativesClientPick
              clients={clients}
              recentClients={recentClients}
              onSelectRoster={(id) => void handleClientSelect(id)}
              onSelectRecent={handleRecentClientClick}
            />
          )}

          {/* Recent clients — only when scanning by URL (quick reuse) */}
          {contextMode === 'url' && recentClients.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-nativz-border">
              <p className="text-xs text-text-muted uppercase tracking-wide text-center">Recent</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {recentClients.map((rc) => (
                  <button
                    key={rc.clientId}
                    type="button"
                    onClick={() => handleRecentClientClick(rc)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-nativz-border bg-surface hover:border-accent/30 transition-colors cursor-pointer"
                  >
                    {rc.logo_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={rc.logo_url} alt={rc.name} className="h-8 w-8 rounded-lg object-contain" />
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center text-xs font-bold text-text-muted">
                        {rc.name[0]}
                      </div>
                    )}
                    <span className="text-[10px] text-text-secondary truncate w-full text-center">{rc.name}</span>
                    <span className="text-[10px] text-accent-text">{rc.creativeCount} ads</span>
                  </button>
                ))}
              </div>
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
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
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
                    <h1 className="truncate text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
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

              {activeTab === 'gallery' && resolvedClientId && (
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  {clientDnaReady ? (
                    <>
                      <p className="hidden text-right text-[11px] text-text-muted sm:block sm:max-w-[220px]">
                        Run the wizard to create a new batch of static ads.
                      </p>
                      <Button
                        type="button"
                        size="lg"
                        shape="pill"
                        className="w-full shadow-lg shadow-accent/15 sm:w-auto"
                        onClick={() => setAdWizardOpen(true)}
                      >
                        <Sparkles size={18} strokeWidth={1.75} />
                        Generate creatives
                      </Button>
                    </>
                  ) : (
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
                  )}
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

      {/* Active generation banner */}
      {resolvedClientId && (
        <GenerationBanner clientId={resolvedClientId} onViewGallery={() => setTab('gallery')} />
      )}

      {resolvedClientId && isScanning && (
        <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/[0.06] px-4 py-3 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-text" />
          <div>
            <p className="font-medium text-text-primary">
              {clientLikelyUsesBrandDna
                ? 'Loading brand & products from Brand DNA…'
                : 'Crawling site for brand & products…'}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              You can switch tabs — open Generate creatives in the gallery when this finishes.
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
        />
      )}
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
        onClose={() => setAdWizardOpen(false)}
        maxWidth="full"
        className="max-h-[min(92vh,940px)] sm:max-w-[min(96vw,1440px)]"
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
              clientSlug={resolvedClient?.slug}
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
