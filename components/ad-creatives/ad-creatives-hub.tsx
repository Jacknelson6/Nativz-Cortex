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
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';
import { CreativeGallery } from './creative-gallery';
import { TemplateCatalog } from './template-catalog';
import { AdWizard } from './ad-wizard';
import { BulkTemplateImport } from './bulk-template-import';
import { GenerationBanner } from './generation-banner';
import { BrandDnaRequiredPanel } from './brand-dna-required-panel';
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';
import type { RecentClient } from '@/app/admin/ad-creatives/page';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContextMode = 'url' | 'client';
type Tab = 'generate' | 'gallery' | 'templates';

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
  { key: 'generate', label: 'Generate', icon: Sparkles },
  { key: 'gallery', label: 'Gallery', icon: Image },
  { key: 'templates', label: 'Templates', icon: LayoutGrid },
];

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------

function useAnimatedCounter(target: number, duration: number = 3000) {
  const [value, setValue] = useState(0);
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

  // Context state
  const [contextMode, setContextMode] = useState<ContextMode>('url');
  const [brandUrl, setBrandUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [brand, setBrand] = useState<ScrapedBrand | null>(null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);

  // Generation state (passed from wizard → gallery)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [placeholderConfig, setPlaceholderConfig] = useState<PlaceholderConfig | null>(null);

  // Tab state (only shown after context is set)
  const activeTab = (searchParams.get('tab') as Tab) || 'generate';
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);

  const selectedClient = clients.find((c) => c.id === clientId);
  const hasContext = brand !== null || clientId !== null;
  const isScanning = scanning && clientId !== null;

  // Resolve the client ID for API calls
  const resolvedClientId = clientId ?? (brand ? findClientByUrl(clients, brand.url) : null);
  const resolvedClient = resolvedClientId ? clients.find((c) => c.id === resolvedClientId) : null;
  const brandDnaReady =
    !resolvedClientId ||
    resolvedClient?.brand_dna_status === 'active' ||
    resolvedClient?.brand_dna_status === 'draft';

  const counter = useAnimatedCounter(10000);

  const setTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'generate') {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // ---------------------------------------------------------------------------
  // Scan brand (uses new crawl-brand API with knowledge caching)
  // ---------------------------------------------------------------------------

  async function handleScan() {
    let url = brandUrl.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
      setBrandUrl(url);
    }

    setScanning(true);
    setBrand(null);
    setScrapedProducts([]);
    setMediaUrls([]);

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

      if (data.status === 'cached' || data.status === 'ready') {
        // Immediate result from knowledge cache
        setBrand(data.brand ?? null);
        setScrapedProducts(data.products ?? []);
        setMediaUrls(data.mediaUrls ?? []);
        setScanning(false);
      } else {
        // Crawl started in background — poll for completion
        pollForBrandContext(null, url);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan website');
      setScanning(false);
    }
  }

  async function handleClientSelect(id: string | null) {
    setClientId(id);
    if (!id) return;

    // Clear URL state
    setBrand(null);
    setBrandUrl('');
    setScrapedProducts([]);
    setMediaUrls([]);

    const client = clients.find((c) => c.id === id);

    // Check if this client has existing creatives — default to gallery
    const hasCreatives = recentClients.some((rc) => rc.clientId === id);
    if (hasCreatives) {
      setTab('gallery');
    }

    // Auto-scan client's website URL for brand context
    const url = client?.website_url;
    if (url) {
      setScanning(true);
      try {
        const res = await fetch('/api/ad-creatives/crawl-brand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, clientId: id }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.status === 'cached' || data.status === 'ready') {
            setBrand(data.brand ?? null);
            setScrapedProducts(data.products ?? []);
            setMediaUrls(data.mediaUrls ?? []);
            setScanning(false);
          } else {
            pollForBrandContext(id, null);
          }
        } else {
          setScanning(false);
        }
      } catch {
        setScanning(false);
      }
    }
  }

  function pollForBrandContext(pollClientId: string | null, _pollUrl: string | null) {
    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        if (pollClientId) params.set('clientId', pollClientId);
        const res = await fetch(`/api/ad-creatives/crawl-brand?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'ready') {
          setBrand(data.brand ?? null);
          setScrapedProducts(data.products ?? []);
          setMediaUrls(data.mediaUrls ?? []);
          setScanning(false);
          clearInterval(interval);
        }
      } catch {
        // Keep polling
      }
    }, 3000);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(interval);
      setScanning(false);
    }, 300_000);
  }

  function handleReset() {
    setBrand(null);
    setBrandUrl('');
    setScrapedProducts([]);
    setMediaUrls([]);
    setClientId(null);
    setActiveBatchId(null);
    setPlaceholderConfig(null);
  }

  function handleRecentClientClick(rc: RecentClient) {
    setClientId(rc.clientId);
    // Set brand URL if available for auto-scan
    if (rc.website_url) {
      handleClientSelect(rc.clientId);
    }
    setTab('gallery');
  }

  // Called by wizard when generation starts
  function handleGenerationStart(batchId: string, config: PlaceholderConfig) {
    setActiveBatchId(batchId);
    setPlaceholderConfig(config);
    setTab('gallery');
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
            ]).map(({ mode, icon: Icon, label }) => (
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
                    className="w-full rounded-xl border border-nativz-border bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors focus:border-accent focus:outline-none"
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
                  <p className="text-sm text-text-muted">Crawling site for brand & products...</p>
                </div>
              )}

              <p className="text-xs text-text-muted text-center">
                We&apos;ll crawl your entire website for brand assets, colors, and products.
              </p>
            </div>
          )}

          {/* Client picker */}
          {contextMode === 'client' && (
            <div className="space-y-3">
              <ClientPickerButton
                clients={clients}
                value={clientId}
                onChange={handleClientSelect}
                placeholder="Select a client"
              />
              <p className="text-xs text-text-muted text-center">
                Uses existing brand DNA and product info from the knowledge base.
              </p>
            </div>
          )}

          {/* Recent clients */}
          {recentClients.length > 0 && (
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Ad creatives</h1>
            <p className="text-sm text-text-muted">
              {brand?.name ?? selectedClient?.name ?? 'Unknown brand'}
            </p>
          </div>
          {brand && (
            <div className="flex items-center gap-1.5 ml-2">
              {brand.colors.slice(0, 4).map((color, i) => (
                <div
                  key={`${color}-${i}`}
                  className="h-4 w-4 rounded-full border border-white/10"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active generation banner */}
      {resolvedClientId && (
        <GenerationBanner clientId={resolvedClientId} onViewGallery={() => setTab('gallery')} />
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-surface rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
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
            clientId={resolvedClientId ?? ''}
            onClose={() => setShowBulkImport(false)}
            onImportComplete={() => setTemplateRefreshKey((k) => k + 1)}
          />
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'generate' && isScanning && (
        <div className="rounded-2xl border border-nativz-border bg-surface p-12 flex flex-col items-center justify-center gap-4">
          <Loader2 size={28} className="animate-spin text-accent-text" />
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">Crawling site for brand & products...</p>
            <p className="text-xs text-text-muted mt-1">
              Analyzing {selectedClient?.name ?? 'website'} — crawling all pages for colors, products, and brand identity
            </p>
          </div>
        </div>
      )}
      {activeTab === 'generate' &&
        !isScanning &&
        resolvedClientId &&
        !brandDnaReady &&
        resolvedClient && (
          <BrandDnaRequiredPanel
            clientId={resolvedClientId}
            clientSlug={resolvedClient.slug}
            clientName={resolvedClient.name}
            brandDnaStatus={resolvedClient.brand_dna_status}
          />
        )}
      {activeTab === 'generate' && !isScanning && (!resolvedClientId || brandDnaReady) && (
        <AdWizard
          clientId={resolvedClientId ?? ''}
          initialBrand={brand ?? undefined}
          initialProducts={scrapedProducts}
          initialMediaUrls={mediaUrls}
          onGenerationStart={handleGenerationStart}
        />
      )}
      {activeTab === 'gallery' && resolvedClientId && (
        <CreativeGallery
          clientId={resolvedClientId}
          onNavigateToGenerate={() => setTab('generate')}
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
