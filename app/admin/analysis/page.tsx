'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers, Plus, MoreHorizontal, Clock, FolderOpen, Pencil, Copy, Trash2, Archive, ArchiveRestore,
  Film, Link2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { useBrandMode } from '@/components/layout/brand-mode-provider';
import { CreateBoardModal } from '@/components/moodboard/create-board-modal';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { detectLinkType, linkTypeToItemType } from '@/lib/types/moodboard';
import type { MoodboardBoard } from '@/lib/types/moodboard';

export default function MoodboardPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<MoodboardBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [initialClientForCreate, setInitialClientForCreate] = useState<string | null>(null);
  const openedBoardFromQuery = useRef(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { mode } = useBrandMode();
  const isAC = mode === 'anderson';

  // Quick analyze state
  const [quickUrl, setQuickUrl] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);

  const { confirm: confirmDelete, dialog: confirmDeleteDialog } = useConfirm({
    title: 'Delete board',
    description: 'This will permanently delete this board and all its items. This action cannot be undone.',
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  const fetchBoards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analysis/boards?show_archived=${showArchived}`);
      if (!res.ok) throw new Error('Failed to load boards');
      const data = await res.json();
      setBoards(data);
    } catch {
      toast.error('Failed to load moodboards');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  /** Deep link from Strategy lab: /admin/analysis?createBoard=1&clientId=… */
  useEffect(() => {
    if (typeof window === 'undefined' || openedBoardFromQuery.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('createBoard') !== '1') return;
    const cid = params.get('clientId');
    if (!cid) return;
    openedBoardFromQuery.current = true;
    setInitialClientForCreate(cid);
    setCreateOpen(true);
    router.replace('/admin/analysis', { scroll: false });
  }, [router]);

  // ── Quick analyze: create/find a "Quick analyses" board, add item, navigate ──
  async function handleQuickAnalyze() {
    const url = quickUrl.trim();
    if (!url) return;

    try {
      new URL(url);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    setQuickLoading(true);
    try {
      // Find or create "Quick analyses" board
      let boardId: string;
      const existing = boards.find((b) => b.name === 'Quick analyses' && !b.archived_at);
      if (existing) {
        boardId = existing.id;
      } else {
        const boardRes = await fetch('/api/analysis/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Quick analyses' }),
        });
        if (!boardRes.ok) throw new Error('Failed to create board');
        const board = await boardRes.json();
        boardId = board.id;
      }

      // Add item to board
      const detected = detectLinkType(url);
      const itemType = linkTypeToItemType(detected);
      const itemRes = await fetch('/api/analysis/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: boardId, url, type: itemType }),
      });
      if (!itemRes.ok) throw new Error('Failed to add video');
      const createdItem = await itemRes.json();

      toast.success('Analyzing video...');
      setQuickUrl('');
      router.push(`/admin/analysis/video/${createdItem.id}`);
    } catch {
      toast.error('Failed to analyze video');
    } finally {
      setQuickLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirmDelete();
    if (!ok) return;
    try {
      const res = await fetch(`/api/analysis/boards/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Board deleted');
      setBoards((prev) => prev.filter((b) => b.id !== id));
    } catch {
      toast.error('Failed to delete board');
    }
    setMenuOpenId(null);
  }

  async function handleDuplicate(board: MoodboardBoard) {
    try {
      const res = await fetch(`/api/analysis/boards/${board.id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error();
      toast.success('Board duplicated');
      fetchBoards();
    } catch {
      toast.error('Failed to duplicate board');
    }
    setMenuOpenId(null);
  }

  async function handleArchive(board: MoodboardBoard) {
    const isArchived = !!board.archived_at;
    try {
      const res = await fetch(`/api/analysis/boards/${board.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !isArchived }),
      });
      if (!res.ok) throw new Error();
      toast.success(isArchived ? 'Board unarchived' : 'Board archived');
      fetchBoards();
    } catch {
      toast.error('Failed to update board');
    }
    setMenuOpenId(null);
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div className="cortex-page-gutter space-y-12">
      {/* Header + Cards — centered like research page */}
      <div className="flex flex-col items-center justify-center pt-8">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <h1 className="ui-page-title-hero">What would you like to analyze?</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Quick analyze */}
        <SpotlightCard spotlightColor={isAC ? "rgba(54, 209, 194, 0.15)" : "rgba(168, 85, 247, 0.15)"} className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent2-surface mb-3">
              <Film size={18} className="text-accent2-text" />
            </div>
            <h2 className="text-base font-semibold text-text-primary mb-1">Analyze a video</h2>
            <p className="text-sm text-text-muted mb-4">
              Paste a URL to get hook analysis, transcription, and insights
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); handleQuickAnalyze(); }}
              className="w-full space-y-2"
            >
              <div className="relative">
                <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="url"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  placeholder="Paste a video URL..."
                  className="w-full rounded-lg border border-nativz-border bg-surface py-2.5 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent2/50 focus:outline-none focus:ring-1 focus:ring-accent2/50 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={quickLoading || !quickUrl.trim()}
                className="w-full rounded-lg bg-accent2-surface border border-accent2/25 py-2.5 text-sm font-semibold text-accent2-text hover:bg-accent2-surface transition-colors disabled:opacity-40 cursor-pointer"
              >
                {quickLoading ? 'Analyzing...' : 'Analyze'}
              </button>
            </form>
          </div>
        </SpotlightCard>

        {/* Moodboard */}
        <SpotlightCard spotlightColor={isAC ? "rgba(43, 181, 168, 0.15)" : "rgba(91, 163, 230, 0.15)"} className="p-6">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full text-left cursor-pointer"
          >
            <div className="flex flex-col items-center text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface mb-3">
                <Layers size={18} className="text-accent-text" />
              </div>
              <h2 className="text-base font-semibold text-text-primary mb-1">Create a moodboard</h2>
              <p className="text-sm text-text-muted mb-4">
                Collect videos, images, and websites on a visual canvas
              </p>
              <div className="w-full rounded-lg bg-accent-surface/50 border border-accent/25 py-2.5 text-center">
                <span className="text-sm font-semibold text-accent-text">New board</span>
              </div>
            </div>
          </button>
        </SpotlightCard>
          </div>
        </div>
      </div>

      {/* Boards section */}
      {!loading && boards.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">Your boards</h2>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`cursor-pointer flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                showArchived ? 'bg-accent/10 text-accent-text' : 'text-text-muted hover:bg-surface-hover'
              }`}
            >
              <Archive size={14} />
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board, i) => (
              <div
                key={board.id}
                className="animate-stagger-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="relative group rounded-xl border border-nativz-border bg-surface overflow-hidden shadow-card hover:shadow-elevated transition-all duration-300 hover:border-transparent hover:ring-1 hover:ring-accent/40">
                  <div className={`absolute -inset-px rounded-xl bg-gradient-to-r transition-all duration-500 -z-10 blur-sm ${
                    isAC
                      ? 'from-teal-500/0 via-teal-400/0 to-teal-500/0 group-hover:from-teal-500/20 group-hover:via-teal-400/20 group-hover:to-teal-500/20'
                      : 'from-blue-500/0 via-accent2/0 to-blue-500/0 group-hover:from-blue-500/20 group-hover:via-accent2/20 group-hover:to-blue-500/20'
                  }`} />

                  <button
                    onClick={() => router.push(`/admin/analysis/${board.id}`)}
                    className="cursor-pointer w-full text-left"
                  >
                    <div className="h-32 relative overflow-hidden">
                      {(board.thumbnails ?? []).length > 0 ? (
                        <div className={`grid h-full ${
                          (board.thumbnails?.length ?? 0) === 1 ? 'grid-cols-1' :
                          (board.thumbnails?.length ?? 0) === 2 ? 'grid-cols-2' :
                          (board.thumbnails?.length ?? 0) === 3 ? 'grid-cols-3' :
                          'grid-cols-2 grid-rows-2'
                        }`}>
                          {(board.thumbnails ?? []).slice(0, 4).map((thumb, ti) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={ti} src={thumb} alt="" className="w-full h-full object-cover" />
                          ))}
                        </div>
                      ) : (
                        <div className="h-full bg-gradient-to-br from-surface-hover via-accent/5 to-surface-hover flex items-center justify-center"
                          style={{ backgroundImage: isAC
                            ? 'radial-gradient(circle at 20% 50%, rgba(54,209,194,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(43,181,168,0.08) 0%, transparent 50%)'
                            : 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(168,85,247,0.08) 0%, transparent 50%)'
                          }}>
                          <Layers size={28} className="text-text-muted/20" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
                      <div className="absolute top-2.5 right-2.5 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white shadow-md flex items-center gap-1">
                        <FolderOpen size={10} />
                        {board.item_count ?? 0}
                      </div>
                      {board.client_name && (
                        <span className="absolute top-2.5 left-2.5 rounded-full bg-accent/80 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
                          {board.client_name}
                        </span>
                      )}
                    </div>

                    <div className="px-4 py-3 space-y-1">
                      <h3 className="text-sm font-semibold text-text-primary truncate group-hover:text-accent-text transition-colors">{board.name}</h3>
                      <div className="flex items-center gap-3 text-[11px] text-text-muted">
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {formatDate(board.updated_at)}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Context menu */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === board.id ? null : board.id);
                      }}
                      className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors"
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {menuOpenId === board.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/admin/analysis/${board.id}`); }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                          <Pencil size={12} /> Open
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDuplicate(board); }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                          <Copy size={12} /> Duplicate
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleArchive(board); }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                        >
                          {board.archived_at ? <ArchiveRestore size={12} /> : <Archive size={12} />}
                          {board.archived_at ? 'Unarchive' : 'Archive'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(board.id); }}
                          className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-surface-hover transition-colors"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-48 animate-pulse">
              <div className="h-full flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-2/3 rounded bg-surface-hover" />
                  <div className="h-3 w-1/3 rounded bg-surface-hover" />
                </div>
                <div className="h-3 w-1/2 rounded bg-surface-hover" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state — only when no boards and not loading */}
      {!loading && boards.length === 0 && (
        <EmptyState
          icon={<Layers size={32} />}
          title="No boards yet"
          description="Create your first moodboard to start collecting video references, images, and website inspiration."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              Create your first board
            </Button>
          }
        />
      )}

      {/* Create Board Modal */}
      <CreateBoardModal
        open={createOpen}
        initialClientId={initialClientForCreate}
        onClose={() => {
          setCreateOpen(false);
          setInitialClientForCreate(null);
        }}
        onCreated={(board) => {
          setCreateOpen(false);
          setInitialClientForCreate(null);
          router.push(`/admin/analysis/${board.id}`);
        }}
      />

      {confirmDeleteDialog}
    </div>
  );
}
