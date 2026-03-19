'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowLeft, Image, LayoutGrid, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { CreativeGallery } from './creative-gallery';
import { TemplateCatalog } from './template-catalog';
import { AdWizard } from './ad-wizard';
import { BulkTemplateImport } from './bulk-template-import';

type Tab = 'gallery' | 'templates' | 'generate';

const TABS: { key: Tab; label: string; icon: typeof Image }[] = [
  { key: 'gallery', label: 'Gallery', icon: Image },
  { key: 'templates', label: 'Templates', icon: LayoutGrid },
  { key: 'generate', label: 'Generate', icon: Sparkles },
];

interface AdCreativesViewProps {
  clientId: string;
  clientName: string;
  clientSlug: string;
  creativeCount: number;
}

export function AdCreativesView({
  clientId,
  clientName,
  clientSlug,
  creativeCount,
}: AdCreativesViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);

  const activeTab = (searchParams.get('tab') as Tab) || 'gallery';

  const setTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'gallery') {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
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
            className="text-text-muted hover:text-text-secondary transition-colors"
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
      {activeTab === 'generate' && (
        <AdWizard clientId={clientId} />
      )}
    </div>
  );
}
