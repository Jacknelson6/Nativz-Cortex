'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { ShieldAlert, FolderOpen, LayoutTemplate, X } from 'lucide-react';
import { AdAssetLibrary, type AdAsset } from './ad-asset-library';
import { AdTemplateLibrary, type AdPromptTemplate } from './ad-template-library';
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
  initialConcepts: AdConcept[];
}

type DnaTone = 'ready' | 'pending' | 'missing';
type Drawer = 'assets' | 'templates' | null;

function classifyDna(status: string): DnaTone {
  if (status === 'ready' || status === 'complete' || status === 'complete_ready') return 'ready';
  if (status === 'pending' || status === 'running' || status === 'queued') return 'pending';
  return 'missing';
}

/**
 * Workspace shell. The full-page transcript + tab nav is gone — what's left
 * is a thin brand strip header, a scrollable masonry gallery, and the
 * floating composer pinned to the bottom. Library and Patterns slide in as
 * right-side drawers so they don't crowd the gallery.
 */
export function AdGeneratorWorkspace({
  clientId,
  clientName,
  clientLogoUrl = null,
  brandDnaStatus,
  initialAssets,
  initialTemplates,
  initialConcepts,
}: Props) {
  const [concepts, setConcepts] = useState<AdConcept[]>(initialConcepts);
  const [drawer, setDrawer] = useState<Drawer>(null);

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
            label="Asset library"
            count={initialAssets.length}
            onClick={() => setDrawer('assets')}
          >
            <FolderOpen size={14} />
          </HeaderButton>
          <HeaderButton
            label="Pattern library"
            count={initialTemplates.length}
            onClick={() => setDrawer('templates')}
          >
            <LayoutTemplate size={14} />
          </HeaderButton>
        </div>
      </header>

      {/* DNA missing nudge — slim banner under the header. Hidden once DNA
          is ready or generating so it doesn't crowd the gallery. */}
      {dnaTone === 'missing' && (
        <div className="flex shrink-0 items-center gap-3 border-b border-nz-coral/30 bg-nz-coral/[0.05] px-6 py-2.5">
          <ShieldAlert size={14} className="shrink-0 text-nz-coral" />
          <p className="text-[12px] text-text-secondary">
            <span className="font-medium text-text-primary">Brand DNA missing.</span>{' '}
            Generations will run on surface-level prompts. Run a DNA pass on the
            brand profile for stronger results.
          </p>
        </div>
      )}

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

      {/* Drawers */}
      {drawer && (
        <Drawer onClose={() => setDrawer(null)} title={drawer === 'assets' ? 'Asset library' : 'Pattern library'}>
          {drawer === 'assets' ? (
            <AdAssetLibrary clientId={clientId} initialAssets={initialAssets} />
          ) : (
            <AdTemplateLibrary clientId={clientId} initialTemplates={initialTemplates} />
          )}
        </Drawer>
      )}
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
