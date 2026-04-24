'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  MessagesSquare,
  Images,
  FolderOpen,
  LayoutTemplate,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { AdAssetLibrary, type AdAsset } from './ad-asset-library';
import { AdTemplateLibrary, type AdPromptTemplate } from './ad-template-library';
import { AdGeneratorChat } from './ad-generator-chat';
import { AdConceptGallery, type AdConcept } from './ad-concept-gallery';

type TabId = 'chat' | 'gallery' | 'assets' | 'templates';

interface TabDef {
  id: TabId;
  label: string;
  hint: string;
  icon: typeof MessagesSquare;
}

const TABS: readonly TabDef[] = [
  { id: 'chat',      label: 'Chat',      hint: 'Brief the generator',         icon: MessagesSquare },
  { id: 'gallery',   label: 'Gallery',   hint: 'Review what it made',         icon: Images },
  { id: 'assets',    label: 'Assets',    hint: 'Brand reference photos',      icon: FolderOpen },
  { id: 'templates', label: 'Templates', hint: 'Reusable ad blueprints',      icon: LayoutTemplate },
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
              style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
            >
              Generate ads for <u>{brandDisplayName}</u>
            </h1>
            <p
              className="max-w-2xl text-sm text-text-muted"
              style={{ fontFamily: 'Poppins, system-ui, sans-serif', fontWeight: 300 }}
            >
              Chat-led creative generation grounded in brand DNA, reference assets, and
              reusable templates. Cortex writes copy, drafts visuals with Gemini 2.5 Flash,
              and keeps every variation auditable in the gallery.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className="shrink-0 inline-flex items-center gap-2 rounded-full bg-[#9314CE] px-5 py-2.5 text-xs font-bold uppercase tracking-[2px] text-white transition-colors hover:bg-[#7A0FB0] cursor-pointer"
            style={{ fontFamily: 'Jost, system-ui, sans-serif' }}
          >
            <Sparkles size={14} />
            New batch
          </button>
        </div>

        {/* Brand context strip — logo, DNA status, stats. Flat, pill-shaped */}
        <div
          className="flex flex-wrap items-center gap-3 animate-stagger-in"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center gap-2 rounded-full border border-nativz-border bg-surface pr-4 pl-1.5 py-1.5">
            {clientLogoUrl ? (
              <Image
                src={clientLogoUrl}
                alt={brandDisplayName}
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold uppercase tracking-wider text-accent-text">
                {brandDisplayName.slice(0, 2)}
              </span>
            )}
            <span className="text-xs font-medium text-text-primary">{brandDisplayName}</span>
          </div>

          <DnaBadge tone={dnaTone} />

          <StatPill label="concepts"   value={concepts.length} />
          <StatPill label="templates"  value={initialTemplates.length} />
          <StatPill label="assets"     value={initialAssets.length} />
        </div>

        {/* Brand DNA callout — elevated when missing, quiet when ready */}
        {dnaTone === 'missing' && (
          <div
            className="animate-stagger-in rounded-xl border border-[#ED6B63]/35 bg-[#ED6B63]/[0.06] p-4"
            style={{ animationDelay: '200ms' }}
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ED6B63]/15 text-[#ED6B63]">
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
          </div>
        )}
      </header>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <nav
        aria-label="Ad generator sections"
        className="flex flex-wrap items-stretch gap-1 animate-stagger-in"
        style={{ animationDelay: '240ms' }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id];
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`group relative flex min-w-[9rem] flex-1 items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-left transition-colors cursor-pointer sm:flex-none ${
                isActive
                  ? 'border-accent/40 bg-accent/[0.06]'
                  : 'border-nativz-border hover:border-nativz-border/90 hover:bg-surface-hover/40'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent-text'
                    : 'bg-surface-hover/60 text-text-muted group-hover:text-text-secondary'
                }`}
              >
                <Icon size={15} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={`text-sm font-semibold ${
                      isActive ? 'text-text-primary' : 'text-text-secondary'
                    }`}
                  >
                    {tab.label}
                  </span>
                  {count !== null && (
                    <span
                      className={`font-mono text-[10px] tabular-nums ${
                        isActive ? 'text-accent-text' : 'text-text-muted/80'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-text-muted truncate">{tab.hint}</span>
              </span>
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

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-nativz-border bg-surface px-3 py-1.5">
      <span
        className="font-mono text-xs font-semibold tabular-nums text-text-primary"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-text-muted">{label}</span>
    </div>
  );
}

function DnaBadge({ tone }: { tone: DnaTone }) {
  if (tone === 'ready') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent-text">
        <ShieldCheck size={12} />
        Brand DNA loaded
      </span>
    );
  }
  if (tone === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-300">
        <Loader2 size={12} className="animate-spin" />
        Brand DNA generating
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ED6B63]/35 bg-[#ED6B63]/10 px-3 py-1.5 text-[11px] font-medium text-[#ED6B63]">
      <ShieldAlert size={12} />
      Brand DNA missing
    </span>
  );
}
