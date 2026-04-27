'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { Library, X } from 'lucide-react';
import { AdAssetLibrary, type AdAsset } from './ad-asset-library';
import { AdTemplateLibrary, type AdPromptTemplate } from './ad-template-library';
import {
  AdReferenceLibrary,
  type ReferenceAdRow,
} from './ad-reference-library';
import { AdGeneratorChat } from './ad-generator-chat';
import { AdConceptGallery, type AdConcept } from './ad-concept-gallery';

interface Props {
  clientId: string;
  clientName: string;
  clientSlug: string;
  clientLogoUrl?: string | null;
  brandDnaStatus: string;
  initialAssets: AdAsset[];
  initialTemplates: AdPromptTemplate[];
  initialReferenceAds: ReferenceAdRow[];
  initialConcepts: AdConcept[];
}

type DnaTone = 'ready' | 'pending' | 'missing';
type LibraryTab = 'references' | 'assets' | 'patterns';

function classifyDna(status: string): DnaTone {
  if (status === 'ready' || status === 'complete' || status === 'complete_ready') return 'ready';
  if (status === 'pending' || status === 'running' || status === 'queued') return 'pending';
  return 'missing';
}

/**
 * Workspace shell. Thin brand strip header, scrollable masonry gallery, and
 * a floating composer at the bottom. The Library button on the right opens
 * a tabbed drawer (References / Brand assets / Patterns) so the three input
 * libraries live behind one trigger.
 */
export function AdGeneratorWorkspace({
  clientId,
  clientName,
  clientLogoUrl = null,
  brandDnaStatus,
  initialAssets,
  initialTemplates,
  initialReferenceAds,
  initialConcepts,
}: Props) {
  const [concepts, setConcepts] = useState<AdConcept[]>(initialConcepts);
  const [libraryTab, setLibraryTab] = useState<LibraryTab | null>(null);

  const handleBatchComplete = useCallback((fresh: AdConcept[]) => {
    setConcepts((prev) => [...fresh, ...prev]);
  }, []);

  const handleUpdate = useCallback((updated: AdConcept) => {
    setConcepts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const handleDelete = useCallback((id: string) => {
    setConcepts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleConceptsChanged = useCallback(
    (updatedRows: AdConcept[], deletedIds: string[]) => {
      setConcepts((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        for (const u of updatedRows) byId.set(u.id, u);
        for (const id of deletedIds) byId.delete(id);
        return Array.from(byId.values()).sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
      });
    },
    [],
  );

  const dnaTone = classifyDna(brandDnaStatus);
  const brandDisplayName = clientName.trim() || 'this brand';

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Brand strip — replaces the hero. Logo + name on the left, DNA dot in
          the middle, library/patterns triggers on the right. Slim and quiet
          so the masonry below carries the visual weight. */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-nativz-border/60 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {clientLogoUrl ? (
            <Image
              src={clientLogoUrl}
              alt={brandDisplayName}
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold uppercase tracking-wider text-accent-text">
              {brandDisplayName.slice(0, 2)}
            </span>
          )}
          <div className="min-w-0 leading-tight">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/80">
              Ad generator
            </p>
            <p className="truncate text-[14px] font-medium text-text-primary">
              {brandDisplayName}
            </p>
          </div>
          <Separator />
          <DnaBadge tone={dnaTone} />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <HeaderButton
            label="Library"
            count={
              initialReferenceAds.length +
              initialAssets.length +
              initialTemplates.length
            }
            onClick={() => setLibraryTab('references')}
          >
            <Library size={14} />
          </HeaderButton>
        </div>
      </header>

      {/* Gallery — scrollable middle region. Carries the masonry of approved/
          pending/rejected concepts plus the filter strip and share dialog. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <AdConceptGallery
          clientId={clientId}
          concepts={concepts}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      </div>

      {/* Composer — pinned at the bottom, centered, max-w-3xl so it reads
          like a creative-tool generate bar instead of a stretched-edge form. */}
      <div className="shrink-0 border-t border-nativz-border/40 bg-background/40 px-4 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <AdGeneratorChat
            clientId={clientId}
            clientName={brandDisplayName}
            clientLogoUrl={clientLogoUrl}
            onBatchComplete={handleBatchComplete}
            onConceptsChanged={handleConceptsChanged}
          />
        </div>
      </div>

      {/* Library drawer — three tabs: reference ads pulled in from Drive,
          per-client uploaded brand assets, and saved prompt patterns. The
          drawer stays mounted while the user switches between tabs. */}
      {libraryTab && (
        <Drawer onClose={() => setLibraryTab(null)} title="Library">
          <LibraryTabs
            tab={libraryTab}
            onChange={setLibraryTab}
            counts={{
              references: initialReferenceAds.length,
              assets: initialAssets.length,
              patterns: initialTemplates.length,
            }}
          />
          <div className="mt-5">
            {libraryTab === 'references' && (
              <AdReferenceLibrary initialReferenceAds={initialReferenceAds} />
            )}
            {libraryTab === 'assets' && (
              <AdAssetLibrary clientId={clientId} initialAssets={initialAssets} />
            )}
            {libraryTab === 'patterns' && (
              <AdTemplateLibrary
                clientId={clientId}
                initialTemplates={initialTemplates}
              />
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
}

const LIBRARY_TAB_LABELS: Record<LibraryTab, string> = {
  references: 'Reference ads',
  assets: 'Brand assets',
  patterns: 'Patterns',
};

function LibraryTabs({
  tab,
  onChange,
  counts,
}: {
  tab: LibraryTab;
  onChange: (next: LibraryTab) => void;
  counts: Record<LibraryTab, number>;
}) {
  return (
    <div role="tablist" className="flex shrink-0 items-center gap-1 border-b border-nativz-border/60">
      {(['references', 'assets', 'patterns'] as LibraryTab[]).map((key) => {
        const active = key === tab;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`-mb-px inline-flex h-9 cursor-pointer items-center gap-2 border-b-2 px-3 text-[12px] transition-colors ${
              active
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>{LIBRARY_TAB_LABELS[key]}</span>
            <span className="font-mono text-[10px] tabular-nums text-text-muted">
              {String(counts[key]).padStart(2, '0')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden className="text-text-muted/30">
      ·
    </span>
  );
}

function HeaderButton({
  label,
  count,
  onClick,
  children,
}: {
  label: string;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-transparent px-3 text-[12px] text-text-secondary transition-colors hover:border-nativz-border hover:bg-surface hover:text-text-primary"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
      <span className="font-mono text-[10px] tabular-nums text-text-muted">
        {String(count).padStart(2, '0')}
      </span>
    </button>
  );
}

const DNA_CONFIG: Record<DnaTone, { dot: string; text: string; label: string }> = {
  ready:   { dot: 'bg-accent',                  text: 'text-text-primary',   label: 'Brand DNA loaded' },
  pending: { dot: 'bg-amber-400 animate-pulse', text: 'text-text-secondary', label: 'Brand DNA generating' },
  missing: { dot: 'bg-nz-coral',                text: 'text-nz-coral',       label: 'Brand DNA missing' },
};

function DnaBadge({ tone }: { tone: DnaTone }) {
  const config = DNA_CONFIG[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} />
      <span className={`text-[11px] font-medium ${config.text}`}>{config.label}</span>
    </span>
  );
}

function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/50"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-3xl flex-col border-l border-nativz-border bg-background shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-nativz-border/60 px-6 py-4">
          <h2
            className="text-[16px] font-semibold text-text-primary"
            style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {children}
        </div>
      </aside>
    </div>
  );
}
