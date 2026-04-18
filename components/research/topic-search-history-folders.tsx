'use client';

import { useState, useCallback, useEffect, useRef, useId, type FormEvent } from 'react';
import Link from 'next/link';
import { useDroppable } from '@dnd-kit/core';
import {
  ChevronRight,
  Folder,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  ExternalLink,
  Link2,
  Compass,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { HistoryItem } from '@/lib/research/history';
import { folderIconClass, type TopicSearchFolder } from '@/lib/research/topic-search-folders';
import { researchHistorySidebarSectionTitleClass } from '@/components/research/research-history-sidebar-section-title';

interface TopicSearchHistoryFoldersProps {
  folders: TopicSearchFolder[];
  onCreateFolder: (name: string) => Promise<void>;
  onRemoveFromFolder: (folderId: string, topicSearchId: string) => Promise<void>;
  menuSurfaceClass: string;
  menuItemClass: string;
  /** When true, folder rows accept drag-drop from topic search rows (DndContext from parent). */
  droppableFolders?: boolean;
  /** Increment to re-fetch all folder items (e.g. after a drop). */
  refreshKey?: number;
  /** Auto-expand this folder after a drop so the user sees the new item. */
  autoExpandFolderId?: string | null;
}

export function TopicSearchHistoryFolders({
  folders,
  onCreateFolder,
  onRemoveFromFolder,
  menuSurfaceClass,
  menuItemClass,
  droppableFolders = false,
  refreshKey = 0,
  autoExpandFolderId = null,
}: TopicSearchHistoryFoldersProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [folderItems, setFolderItems] = useState<Record<string, HistoryItem[]>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const newFolderNameId = useId();

  useEffect(() => {
    if (!createOpen) return;
    const t = window.setTimeout(() => {
      newFolderInputRef.current?.focus();
      newFolderInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [createOpen]);

  const loadFolder = useCallback(
    async (folderId: string) => {
      setLoadingId(folderId);
      try {
        const res = await fetch(`/api/research/folders/${folderId}/items`);
        if (!res.ok) throw new Error('Failed to load');
        const data = (await res.json()) as { items?: HistoryItem[] };
        setFolderItems((prev) => ({ ...prev, [folderId]: data.items ?? [] }));
      } catch {
        toast.error('Could not load folder');
      } finally {
        setLoadingId(null);
      }
    },
    [],
  );

  /** Pre-fetch items for every folder on mount and after each drop (refreshKey). */
  const folderIds = folders.map((f) => f.id).join(',');
  useEffect(() => {
    if (!folders.length) return;
    for (const f of folders) {
      void loadFolder(f.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderIds, refreshKey]);

  /** Auto-expand the folder that just received a drop. */
  useEffect(() => {
    if (autoExpandFolderId) setOpenId(autoExpandFolderId);
  }, [autoExpandFolderId, refreshKey]);

  const toggle = (folderId: string) => {
    setOpenId((prev) => {
      const next = prev === folderId ? null : folderId;
      if (next && folderItems[folderId] === undefined) void loadFolder(folderId);
      return next;
    });
  };

  const closeCreateDialog = useCallback(() => {
    setCreateOpen(false);
    setNewFolderName('');
    setCreating(false);
  }, []);

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreateFolder(name);
      toast.success('Folder created');
      closeCreateDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create folder');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="shrink-0 border-b border-nativz-border/50 px-3 pb-3 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className={researchHistorySidebarSectionTitleClass}>Folders</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
            title="New folder"
          >
            <FolderPlus size={13} className="shrink-0" aria-hidden />
            New
          </button>
        </div>
        {folders.length === 0 ? null : (
          <ul className="space-y-0.5">
            {folders.map((f) => {
              const expanded = openId === f.id;
              const items = folderItems[f.id];
              const loading = loadingId === f.id;
              return (
                <FolderRowDroppable
                  key={f.id}
                  folderId={f.id}
                  droppable={droppableFolders}
                  expanded={expanded}
                  loading={loading}
                  items={items}
                  folder={f}
                  onToggle={() => toggle(f.id)}
                  onRemoveFromFolder={onRemoveFromFolder}
                  menuSurfaceClass={menuSurfaceClass}
                  menuItemClass={menuItemClass}
                  setFolderItems={setFolderItems}
                />
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={createOpen} onClose={closeCreateDialog} title="New folder" maxWidth="sm">
        <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4">
          <div>
            <label
              htmlFor={newFolderNameId}
              className="mb-1.5 block text-xs font-medium text-text-muted"
            >
              Folder name
            </label>
            <Input
              ref={newFolderInputRef}
              id={newFolderNameId}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Q1 brand research"
              autoComplete="off"
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeCreateDialog();
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={closeCreateDialog} disabled={creating}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={creating || !newFolderName.trim()}
            >
              {creating ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  Creating…
                </>
              ) : (
                'Create folder'
              )}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function FolderRowDroppable({
  folderId,
  droppable,
  expanded,
  loading,
  items,
  folder,
  onToggle,
  onRemoveFromFolder,
  menuSurfaceClass,
  menuItemClass,
  setFolderItems,
}: {
  folderId: string;
  droppable: boolean;
  expanded: boolean;
  loading: boolean;
  items: HistoryItem[] | undefined;
  folder: TopicSearchFolder;
  onToggle: () => void;
  onRemoveFromFolder: (folderId: string, topicSearchId: string) => Promise<void>;
  menuSurfaceClass: string;
  menuItemClass: string;
  setFolderItems: React.Dispatch<React.SetStateAction<Record<string, HistoryItem[]>>>;
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `folder-${folderId}`,
    disabled: !droppable,
  });

  const isDragActive = Boolean(active);

  return (
    <li ref={droppable ? setNodeRef : undefined}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-sm text-text-secondary transition-all duration-150 hover:text-text-primary',
          'hover:bg-surface-hover',
          droppable && isDragActive && !isOver && 'ring-1 ring-accent/15',
          droppable && isOver && 'scale-[1.02] bg-accent/15 ring-2 ring-accent/40',
        )}
      >
        <ChevronRight
          size={14}
          className={cn(
            'shrink-0 text-text-secondary/80 transition-transform',
            expanded && 'rotate-90',
          )}
          aria-hidden
        />
        <Folder size={14} className={cn('shrink-0', folderIconClass(folder.color))} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium" title={folder.name}>{folder.name}</span>
        {items && items.length > 0 ? (
          <span className="shrink-0 text-[10px] tabular-nums text-text-secondary/70">{items.length}</span>
        ) : null}
      </button>
      {expanded ? (
        <ul className="mt-0.5 space-y-0.5 pl-4">
          {loading && items === undefined ? (
            <li className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs text-text-muted">
              <Loader2 size={12} className="animate-spin" aria-hidden />
              Loading…
            </li>
          ) : null}
          {(items ?? []).map((item) => (
            <li
              key={item.id}
              className="group flex items-center justify-between gap-1 rounded-lg border border-transparent px-1.5 py-1 pr-1 transition-colors hover:bg-surface-hover"
            >
              <Link
                href={item.href}
                className="min-w-0 flex-1 truncate text-sm font-normal leading-snug text-text-secondary transition-colors group-hover:text-text-primary"
                title={item.title}
              >
                {item.title}
              </Link>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 text-text-muted opacity-0 transition hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
                    aria-label="More actions"
                  >
                    <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4} className={menuSurfaceClass}>
                  <DropdownMenuItem
                    className={menuItemClass}
                    onSelect={() => {
                      window.location.href = item.href;
                    }}
                  >
                    <ExternalLink size={14} aria-hidden />
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={menuItemClass}
                    onSelect={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}${item.href}`);
                      toast.success('Link copied');
                    }}
                  >
                    <Link2 size={14} aria-hidden />
                    Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={menuItemClass}
                    onSelect={() => {
                      window.location.href = item.clientId
                        ? `/admin/strategy-lab/${item.clientId}`
                        : '/admin/strategy-lab';
                    }}
                  >
                    <Compass size={14} aria-hidden />
                    Open in Content lab
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-nativz-border" />
                  <DropdownMenuItem
                    className={menuItemClass}
                    onSelect={() => {
                      void (async () => {
                        try {
                          await onRemoveFromFolder(folderId, item.id);
                          toast.success('Removed from folder');
                          setFolderItems((prev) => ({
                            ...prev,
                            [folderId]: (prev[folderId] ?? []).filter((x) => x.id !== item.id),
                          }));
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Could not remove');
                        }
                      })();
                    }}
                  >
                    Remove from folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    className={menuItemClass}
                    onSelect={() => {
                      void (async () => {
                        if (!window.confirm('Delete this search from history?')) return;
                        const endpoint = `/api/search/${item.id}`;
                        const res = await fetch(endpoint, { method: 'DELETE' });
                        if (res.ok) {
                          toast.success('Removed from history');
                          setFolderItems((prev) => ({
                            ...prev,
                            [folderId]: (prev[folderId] ?? []).filter((x) => x.id !== item.id),
                          }));
                        } else {
                          toast.error('Could not delete');
                        }
                      })();
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
          {!loading && items && items.length === 0 ? (
            <li className="px-1.5 py-1.5 text-xs text-text-muted">
              Drop a search here or use ⋯ on a row below
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
