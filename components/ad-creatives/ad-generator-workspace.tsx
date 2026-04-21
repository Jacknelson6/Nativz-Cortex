'use client';

import { useState } from 'react';
import { MessagesSquare, Images, FolderOpen, LayoutTemplate } from 'lucide-react';
import { AdAssetLibrary, type AdAsset } from './ad-asset-library';

type TabId = 'chat' | 'gallery' | 'assets' | 'templates';

const TABS: { id: TabId; label: string; icon: typeof MessagesSquare; phase: number }[] = [
  { id: 'chat', label: 'Chat', icon: MessagesSquare, phase: 2 },
  { id: 'gallery', label: 'Gallery', icon: Images, phase: 2 },
  { id: 'assets', label: 'Assets', icon: FolderOpen, phase: 1 },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, phase: 1 },
];

interface Props {
  clientId: string;
  clientName: string;
  clientSlug: string;
  brandDnaStatus: string;
  initialAssets: AdAsset[];
}

/**
 * Ad Generator workspace — tab-driven shell that replaces the old
 * form-heavy /admin/ad-creatives surface. Phase 1 ships with the Assets
 * tab live (upload + list + tag) and the other three tabs stubbed. Phase
 * 2 wires the chat (intake), gallery (concepts + review), and templates
 * (image→JSON extraction).
 */
export function AdGeneratorWorkspace({
  clientId,
  clientName,
  brandDnaStatus,
  initialAssets,
}: Props) {
  // Default to Assets since it's the only live tab in phase 1. When Chat
  // ships in phase 2 we'll flip the default.
  const [activeTab, setActiveTab] = useState<TabId>('assets');

  return (
    <div className="cortex-page-gutter space-y-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-page-title">Ad Generator</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {clientName || 'Client'} · Chat-led ad creative generation
          </p>
        </div>
        {brandDnaStatus === 'none' && (
          <div className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Brand DNA not generated yet — generation quality will suffer until it runs.
          </div>
        )}
      </header>

      {/* Tab bar — mirror the analytics treatment so the two pages feel like
          siblings. Phase-2 tabs are rendered but marked with a subtle
          "Coming soon" label so Jack can click them and see what's next. */}
      <div className="flex items-center rounded-lg border border-nativz-border bg-surface p-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isPlaceholder = tab.phase > 1;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-accent-surface text-accent-text shadow-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Icon size={14} />
              {tab.label}
              {isPlaceholder && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    isActive ? 'bg-accent-surface/60 text-accent-text' : 'bg-surface-hover text-text-muted'
                  }`}
                  title="Coming in Phase 2"
                >
                  soon
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'assets' && (
        <AdAssetLibrary
          clientId={clientId}
          initialAssets={initialAssets}
        />
      )}

      {activeTab === 'chat' && <ComingSoonPanel tab="chat" />}
      {activeTab === 'gallery' && <ComingSoonPanel tab="gallery" />}
      {activeTab === 'templates' && <ComingSoonPanel tab="templates" />}
    </div>
  );
}

function ComingSoonPanel({ tab }: { tab: Exclude<TabId, 'assets'> }) {
  const copy: Record<Exclude<TabId, 'assets'>, { title: string; body: string }> = {
    chat: {
      title: 'Chat intake — Phase 2',
      body: 'Natural-language ad generation. Say "make 30 ads emphasizing testimonials, use these product shots" and the Nerd cycles through the 15 templates, grounding each concept in real reviews and winning ads from the asset library.',
    },
    gallery: {
      title: 'Gallery — Phase 2',
      body: 'Grid view of every generated concept with per-card approve / reject / regenerate. Share link for client review (comments land here before an admin sweeps them into chat commands).',
    },
    templates: {
      title: 'Templates — Phase 2',
      body: 'Drop an ad screenshot, get a reusable JSON layout. The vision model reads the composition (headline position, photo slots, logo placement, color roles) and writes a template that the compositor can render for any brand.',
    },
  };
  const c = copy[tab];
  return (
    <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 p-10 text-center">
      <h2 className="text-base font-semibold text-text-primary">{c.title}</h2>
      <p className="mt-2 mx-auto max-w-xl text-sm text-text-muted">{c.body}</p>
    </div>
  );
}
