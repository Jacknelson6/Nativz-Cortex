'use client';

import { useCallback, useState } from 'react';
import { MessagesSquare, Images, FolderOpen, LayoutTemplate } from 'lucide-react';
import { AdAssetLibrary, type AdAsset } from './ad-asset-library';
import { AdTemplateLibrary, type AdPromptTemplate } from './ad-template-library';
import { AdGeneratorChat } from './ad-generator-chat';
import { AdConceptGallery, type AdConcept } from './ad-concept-gallery';

type TabId = 'chat' | 'gallery' | 'assets' | 'templates';

const TABS: { id: TabId; label: string; icon: typeof MessagesSquare }[] = [
  { id: 'chat', label: 'Chat', icon: MessagesSquare },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'assets', label: 'Assets', icon: FolderOpen },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
];

interface Props {
  clientId: string;
  clientName: string;
  clientSlug: string;
  brandDnaStatus: string;
  initialAssets: AdAsset[];
  initialTemplates: AdPromptTemplate[];
  initialConcepts: AdConcept[];
}

/**
 * Ad Generator workspace — tab-driven shell that replaces the old
 * form-heavy /admin/ad-creatives surface. Phase 2 brings the chat
 * (intake) and gallery (concept review) live alongside the phase-1
 * Assets + Templates tabs.
 *
 * Gallery state lives here so the chat can prepend a freshly-generated
 * batch into the same list the gallery renders — single source of
 * truth, optimistic updates from card actions flow back through a pair
 * of callbacks.
 */
export function AdGeneratorWorkspace({
  clientId,
  clientName,
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

  // Bulk updates from slash commands — merge status changes + drop
  // deleted rows in one pass so the gallery re-renders once per turn.
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

      <div className="flex items-center rounded-lg border border-nativz-border bg-surface p-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badgeCount =
            tab.id === 'gallery' && concepts.length > 0 ? concepts.length : null;
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
              {badgeCount !== null && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    isActive ? 'bg-accent-surface/60 text-accent-text' : 'bg-surface-hover text-text-muted'
                  }`}
                >
                  {badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
  );
}
