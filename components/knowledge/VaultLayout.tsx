'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Copy, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeEntry, KnowledgeGraphData } from '@/lib/knowledge/types';
import { VaultHeader } from './VaultHeader';
import { FileExplorer } from './FileExplorer';
import { EntryEditor } from './EntryEditor';
import { KnowledgeGraph } from './KnowledgeGraph';

interface ContextMenuState {
  x: number;
  y: number;
  entryId: string;
  entryTitle: string;
}

interface VaultLayoutProps {
  clientId: string;
  clientName: string;
  clientSlug: string;
  initialEntries: KnowledgeEntry[];
  initialGraphData: KnowledgeGraphData;
}

export function VaultLayout({
  clientId,
  clientName,
  clientSlug,
  initialEntries,
  initialGraphData,
}: VaultLayoutProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>(initialEntries);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const selectedEntry = selectedEntryId
    ? entries.find((e) => e.id === selectedEntryId) ?? null
    : null;

  const handleSelectEntry = useCallback((id: string) => {
    setSelectedEntryId(id);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setSelectedEntryId(null);
  }, []);

  const handleEntryUpdated = useCallback((updated: KnowledgeEntry) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e))
    );
  }, []);

  const handleContextMenu = useCallback((entryId: string, x: number, y: number) => {
    const entry = initialEntries.find((e) => e.id === entryId) ??
      entries.find((e) => e.id === entryId);
    if (!entry) return;
    setContextMenu({ x, y, entryId, entryTitle: entry.title });
    setConfirmDelete(null);
  }, [entries, initialEntries]);

  // Close context menu on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
        setConfirmDelete(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
          setConfirmDelete(null);
        } else if (selectedEntryId) {
          setSelectedEntryId(null);
        }
      }
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, selectedEntryId]);

  const handleEdit = useCallback((entryId: string) => {
    setContextMenu(null);
    setSelectedEntryId(entryId);
  }, []);

  const handleDuplicate = useCallback(async (entryId: string) => {
    setContextMenu(null);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: entry.type,
          title: `${entry.title} (copy)`,
          content: entry.content,
          metadata: entry.metadata ?? {},
          source: entry.source,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? 'Failed to duplicate');
        return;
      }
      const { entry: newEntry } = await res.json();
      setEntries((prev) => [newEntry, ...prev]);
      toast.success('Entry duplicated');
    } catch {
      toast.error('Failed to duplicate');
    }
  }, [entries, clientId]);

  const handleDelete = useCallback(async (entryId: string) => {
    if (confirmDelete !== entryId) {
      setConfirmDelete(entryId);
      return;
    }

    setContextMenu(null);
    setConfirmDelete(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge/${entryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? 'Failed to delete');
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      if (selectedEntryId === entryId) setSelectedEntryId(null);
      toast.success('Entry deleted');
    } catch {
      toast.error('Failed to delete');
    }
  }, [clientId, confirmDelete, selectedEntryId]);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <VaultHeader
        clientId={clientId}
        clientName={clientName}
        clientSlug={clientSlug}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onEntriesChanged={() => window.location.reload()}
      />

      <div className="flex flex-1 min-h-0">
        {/* File explorer sidebar */}
        <FileExplorer
          entries={entries}
          selectedEntryId={selectedEntryId}
          onSelectEntry={handleSelectEntry}
          onContextMenu={handleContextMenu}
          onHoverEntry={setHoveredEntryId}
          searchQuery={searchQuery}
          links={initialGraphData.links}
        />

        {/* Graph is always the main view */}
        <div className="flex-1 min-w-0 relative">
          <KnowledgeGraph
            data={initialGraphData}
            onNodeContextMenu={handleContextMenu}
            onNodeClick={handleSelectEntry}
            selectedNodeId={selectedEntryId}
            hoveredEntryId={hoveredEntryId}
            searchQuery={searchQuery}
          />
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[60] w-44 rounded-lg border border-nativz-border bg-surface shadow-elevated py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: Math.min(contextMenu.y, window.innerHeight - 160),
            left: Math.min(contextMenu.x, window.innerWidth - 200),
          }}
        >
          <div className="px-3 py-1.5 border-b border-nativz-border">
            <p className="text-[10px] text-text-muted truncate">{contextMenu.entryTitle}</p>
          </div>
          <button
            onClick={() => handleEdit(contextMenu.entryId)}
            className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <Pencil size={13} />
            Edit
          </button>
          <button
            onClick={() => handleDuplicate(contextMenu.entryId)}
            className="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <Copy size={13} />
            Duplicate
          </button>
          <button
            onClick={() => handleDelete(contextMenu.entryId)}
            className={`cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
              confirmDelete === contextMenu.entryId
                ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                : 'text-text-secondary hover:bg-surface-hover hover:text-red-400'
            }`}
          >
            <Trash2 size={13} />
            {confirmDelete === contextMenu.entryId ? 'Click again to confirm' : 'Delete'}
          </button>
        </div>
      )}

      {/* Centered editor modal */}
      {selectedEntry && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
            onClick={handleCloseEditor}
          />

          {/* Centered modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-8 pointer-events-none">
            <div className="w-full max-w-2xl pointer-events-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-surface border border-nativz-border rounded-2xl shadow-elevated max-h-[75vh] overflow-y-auto">
                {/* Modal header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-nativz-border sticky top-0 bg-surface z-10">
                  <span className="text-xs text-text-muted">Quick edit</span>
                  <button
                    onClick={handleCloseEditor}
                    className="cursor-pointer p-1 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Editor content */}
                <EntryEditor
                  key={selectedEntry.id}
                  entry={selectedEntry}
                  allEntries={entries}
                  clientId={clientId}
                  onEntryUpdated={handleEntryUpdated}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
