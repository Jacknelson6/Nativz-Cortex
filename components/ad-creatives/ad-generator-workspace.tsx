'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import { Sparkles, ShieldAlert } from 'lucide-react';
import { AdAssetLibrary, type AdAsset } from './ad-asset-library';
import { AdTemplateLibrary, type AdPromptTemplate } from './ad-template-library';
import { AdGeneratorChat } from './ad-generator-chat';
import { AdConceptGallery, type AdConcept } from './ad-concept-gallery';

type TabId = 'chat' | 'gallery' | 'assets' | 'templates';

interface TabDef {
  id: TabId;
  label: string;
  hint: string;
}

const TABS: readonly TabDef[] = [
  { id: 'chat',      label: 'Brief',     hint: 'Tell Cortex what to make' },
  { id: 'gallery',   label: 'Proofs',    hint: 'Approve the concepts it returned' },
  { id: 'assets',    label: 'Library',   hint: 'Reference photos for the brand' },
  { id: 'templates', label: 'Patterns',  hint: 'Winning ad structures, distilled' },
] as const;

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

function classifyDna(status: string): DnaTone {
  if (status === 'ready' || status === 'complete' || status === 'complete_ready') return 'ready';
  if (status === 'pending' || status === 'running' || status === 'queued') return 'pending';
  return 'missing';
}

export function AdGeneratorWorkspace({
  clientId,
  clientName,
  clientLogoUrl = null,
  brandDnaStatus,
  initialAssets,
  initialTemplates,
  initialConcepts,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(
    initialConcepts.length > 0 ? 'gallery' : 'chat',
  );
  const [concepts, setConcepts] = useState<AdConcept[]>(initialConcepts);

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

  const tabCounts = useMemo<Record<TabId, number | null>>(
    () => ({
      chat: null,
      gallery: concepts.length,
      assets: initialAssets.length,
      templates: initialTemplates.length,
    }),
    [concepts.length, initialAssets.length, initialTemplates.length],
  );

  const brandDisplayName = clientName.trim() || 'this client';

  return (
    <div className="cortex-page-gutter py-6 space-y-8">
      {/* ── Hero header ────────────────────────────────────────────────────── */}
      <header className="space-y-5">
        <div
          className="flex flex-wrap items-end justify-between gap-4 animate-stagger-in"
          style={{ animationDelay: '40ms' }}
        >
          <div className="space-y-2 min-w-0">
            <p className="nz-eyebrow">Ad generator · {brandDisplayName}</p>
            <h1
              className="nz-highlight text-3xl sm:text-[2.5rem] font-semibold leading-[1.05] text-text-primary"
              style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
            >
              Generate ads for <u>{brandDisplayName}</u>
            </h1>
            <p
              className="max-w-2xl text-sm text-text-muted"
              style={{ fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 300 }}
            >
              Monthly gift-ad generation grounded in Brand DNA, Cortex memory, and the
              proven ad reference library. Cortex matches the brand to winning patterns,
              writes the batch, renders with ChatGPT Image, and keeps every variation
              auditable in the gallery.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            <Sparkles size={15} />
            New batch
          </button>
        </div>

        {/* Single-line typographic readout. Replaces the old pill cluster
            with editorial separators — feels like the masthead strip on a
            magazine front page rather than a row of admin badges. */}
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs animate-stagger-in"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center gap-2">
            {clientLogoUrl ? (
              <Image
                src={clientLogoUrl}
                alt={brandDisplayName}
                width={24}
                height={24}
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold uppercase tracking-wider text-accent-text">
                {brandDisplayName.slice(0, 2)}
              </span>
            )}
            <span className="text-text-primary font-medium">{brandDisplayName}</span>
          </div>

          <Separator />

          <DnaBadge tone={dnaTone} />

          <Separator />

          <Readout value={concepts.length} label="concepts" />
          <Readout value={initialTemplates.length} label="templates" />
          <Readout value={initialAssets.length} label="assets" />
        </div>

        {/* Brand DNA callout — elevated when missing, quiet when ready */}
        {dnaTone === 'missing' && (
          <div
            className="animate-stagger-in flex items-start gap-3 rounded-xl border border-nz-coral/35 bg-nz-coral/[0.06] p-4"
            style={{ animationDelay: '200ms' }}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nz-coral/15 text-nz-coral">
              <ShieldAlert size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-text-primary">
                Brand DNA hasn&apos;t been generated yet
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Without it, generations run on surface-level prompts and lose the
                brand&apos;s actual voice. Head to the brand profile to run a DNA pass
                — it takes about a minute and upgrades every future batch.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* ── Section nav ────────────────────────────────────────────────────
          Editorial row sharing a baseline rule. Active tab anchors a 2px
          cyan bar that overlaps the rule — no boxed cards, no icons, no
          rounded chrome. Reads like a magazine table-of-contents strip. */}
      <nav
        aria-label="Ad generator sections"
        className="relative flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-nativz-border/60 animate-stagger-in"
        style={{ animationDelay: '240ms' }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="group relative flex flex-col items-start gap-1 pb-3 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400/60"
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="flex items-baseline gap-2">
                <span
                  className={`text-[15px] font-medium leading-none transition-colors ${
                    isActive
                      ? 'text-text-primary'
                      : 'text-text-secondary group-hover:text-text-primary'
                  }`}
                  style={{ fontFamily: 'var(--font-nz-display), system-ui, sans-serif' }}
                >
                  {tab.label}
                </span>
                {count !== null && (
                  <span
                    className={`font-mono text-[10px] tabular-nums leading-none ${
                      isActive ? 'text-accent-text' : 'text-text-muted/80'
                    }`}
                  >
                    {String(count).padStart(2, '0')}
                  </span>
                )}
              </span>
              <span
                className={`text-[11px] leading-none transition-colors ${
                  isActive ? 'text-text-muted' : 'text-text-muted/70'
                }`}
              >
                {tab.hint}
              </span>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -bottom-px left-0 right-0 h-[2px] bg-accent"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Active tab content ─────────────────────────────────────────────── */}
      <div className="animate-stagger-in" style={{ animationDelay: '320ms' }}>
        {activeTab === 'chat' && (
          <AdGeneratorChat
            clientId={clientId}
            onBatchComplete={handleBatchComplete}
            onConceptsChanged={handleConceptsChanged}
            onSwitchToGallery={() => setActiveTab('gallery')}
          />
        )}

        {activeTab === 'gallery' && (
          <AdConceptGallery
            clientId={clientId}
            concepts={concepts}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        )}

        {activeTab === 'assets' && (
          <AdAssetLibrary clientId={clientId} initialAssets={initialAssets} />
        )}

        {activeTab === 'templates' && (
          <AdTemplateLibrary clientId={clientId} initialTemplates={initialTemplates} />
        )}
      </div>
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

function Readout({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-mono text-[11px] font-medium tabular-nums text-text-primary">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[11px] text-text-muted">{label}</span>
    </span>
  );
}

const DNA_CONFIG: Record<
  DnaTone,
  { dot: string; text: string; label: string }
> = {
  ready:   { dot: 'bg-accent',                 text: 'text-text-primary',   label: 'Brand DNA loaded' },
  pending: { dot: 'bg-amber-400 animate-pulse', text: 'text-text-secondary', label: 'Brand DNA generating' },
  missing: { dot: 'bg-nz-coral',                text: 'text-nz-coral',       label: 'Brand DNA missing' },
};

function DnaBadge({ tone }: { tone: DnaTone }) {
  const config = DNA_CONFIG[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`}
      />
      <span className={`text-[11px] font-medium ${config.text}`}>
        {config.label}
      </span>
    </span>
  );
}
