'use client';

import { useState, useCallback } from 'react';
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
import type { ScrapedBrand, ScrapedProduct } from '@/lib/ad-creatives/scrape-brand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContextMode = 'url' | 'client';
type Tab = 'generate' | 'gallery' | 'templates';

interface ClientWithSlug extends ClientOption {
  slug: string;
  website_url?: string | null;
}

interface AdCreativesHubProps {
  clients: ClientWithSlug[];
}

const TABS: { key: Tab; label: string; icon: typeof Image }[] = [
  { key: 'generate', label: 'Generate', icon: Sparkles },
  { key: 'gallery', label: 'Gallery', icon: Image },
  { key: 'templates', label: 'Templates', icon: LayoutGrid },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdCreativesHub({ clients }: AdCreativesHubProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Context state
  const [contextMode, setContextMode] = useState<ContextMode>('url');
  const [brandUrl, setBrandUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [brand, setBrand] = useState<ScrapedBrand | null>(null);
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);

  // Tab state (only shown after context is set)
  const activeTab = (searchParams.get('tab') as Tab) || 'generate';
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);

  const selectedClient = clients.find((c) => c.id === clientId);
  const hasContext = brand !== null || clientId !== null;
  const isScanning = scanning && clientId !== null;

  // Resolve the client ID for API calls — either picked directly or we need to match by URL
  const resolvedClientId = clientId ?? (brand ? findClientByUrl(clients, brand.url) : null);

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
  // Scan brand
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

    try {
      const res = await fetch('/api/ad-creatives/scrape-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Scan failed');
      }

      const data = await res.json();
      setBrand(data.brand ?? null);
      setScrapedProducts(data.products ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to scan website');
    } finally {
      setScanning(false);
    }
  }

  function handleReset() {
    setBrand(null);
    setBrandUrl('');
    setScrapedProducts([]);
    setClientId(null);
  }

  async function handleClientSelect(id: string | null) {
    setClientId(id);
    if (!id) return;

    // Clear URL state
    setBrand(null);
    setBrandUrl('');
    setScrapedProducts([]);

    // Auto-scan client's website URL for brand context + products
    const client = clients.find((c) => c.id === id);
    const url = client?.website_url;
    if (url) {
      setScanning(true);
      try {
        const res = await fetch('/api/ad-creatives/scrape-brand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        if (res.ok) {
          const data = await res.json();
          setBrand(data.brand ?? null);
          setScrapedProducts(data.products ?? []);
        }
      } catch {
        // Non-fatal — wizard still works without scraped data
      } finally {
        setScanning(false);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Landing — URL or client picker (vibiz-style)
  // ---------------------------------------------------------------------------

  if (!hasContext) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6">
        <div className="w-full max-w-xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-text-primary">Create ad creatives</h1>
            <p className="text-text-muted">
              Enter a website to scan, or select an existing client.
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

              {/* Scanning state */}
              {scanning && (
                <div className="flex items-center justify-center gap-3 py-6">
                  <Loader2 size={20} className="animate-spin text-accent-text" />
                  <p className="text-sm text-text-muted">Scanning brand and products...</p>
                </div>
              )}

              <p className="text-xs text-text-muted text-center">
                We&apos;ll analyze your brand and find products to generate ads for.
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
              {brand.colors.slice(0, 4).map((color) => (
                <div
                  key={color}
                  className="h-4 w-4 rounded-full border border-white/10"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

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
            <p className="text-sm font-medium text-text-primary">Scanning brand & products...</p>
            <p className="text-xs text-text-muted mt-1">
              Analyzing {selectedClient?.name ?? 'website'} for colors, products, and brand identity
            </p>
          </div>
        </div>
      )}
      {activeTab === 'generate' && !isScanning && (
        <AdWizard
          clientId={resolvedClientId ?? ''}
          initialBrand={brand ?? undefined}
          initialProducts={scrapedProducts}
        />
      )}
      {activeTab === 'gallery' && resolvedClientId && (
        <CreativeGallery clientId={resolvedClientId} onNavigateToGenerate={() => setTab('generate')} />
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
  // Try matching the brand URL hostname to a client slug
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const slug = hostname.split('.')[0];
    const match = clients.find((c) => c.slug === slug);
    return match?.id ?? null;
  } catch {
    return null;
  }
}
