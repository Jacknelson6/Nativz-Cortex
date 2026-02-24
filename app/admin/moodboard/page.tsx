'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Plus, MoreHorizontal, Clock, FolderOpen, Pencil, Copy, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { CreateBoardModal } from '@/components/moodboard/create-board-modal';
import { toast } from 'sonner';
import type { MoodboardBoard } from '@/lib/types/moodboard';

export default function MoodboardPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<MoodboardBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const fetchBoards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/moodboard/boards');
      if (!res.ok) throw new Error('Failed to load boards');
      const data = await res.json();
      setBoards(data);
    } catch {
      toast.error('Failed to load moodboards');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this board and all its items?')) return;
    try {
      const res = await fetch(`/api/moodboard/boards/${id}`, { method: 'DELETE' });
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
      const res = await fetch('/api/moodboard/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${board.name} (copy)`,
          description: board.description,
          client_id: board.client_id,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Board duplicated');
      fetchBoards();
    } catch {
      toast.error('Failed to duplicate board');
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Moodboard</h1>
          <p className="text-sm text-text-muted mt-0.5">Visual research and content inspiration</p>
        </div>
        <GlassButton onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          New board
        </GlassButton>
      </div>

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

      {/* Empty state */}
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

      {/* Board grid */}
      {!loading && boards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((board, i) => (
            <div
              key={board.id}
              className="animate-stagger-in"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <Card interactive className="relative group">
                <button
                  onClick={() => router.push(`/admin/moodboard/${board.id}`)}
                  className="cursor-pointer w-full text-left"
                >
                  {/* Thumbnail placeholder */}
                  <div className="h-24 rounded-lg bg-surface-hover/50 mb-3 flex items-center justify-center">
                    <Layers size={24} className="text-text-muted/40" />
                  </div>

                  {/* Board info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary truncate">{board.name}</h3>
                      {board.client_name && (
                        <span className="shrink-0 inline-flex items-center rounded-full bg-accent-surface px-2 py-0.5 text-[10px] font-medium text-accent-text">
                          {board.client_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <FolderOpen size={11} />
                        {board.item_count ?? 0} items
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatDate(board.updated_at)}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Context menu trigger */}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/moodboard/${board.id}`);
                        }}
                        className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                      >
                        <Pencil size={12} />
                        Open
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(board);
                        }}
                        className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
                      >
                        <Copy size={12} />
                        Duplicate
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(board.id);
                        }}
                        className="cursor-pointer flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-surface-hover transition-colors"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Create Board Modal */}
      <CreateBoardModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(board) => {
          setCreateOpen(false);
          router.push(`/admin/moodboard/${board.id}`);
        }}
      />
    </div>
  );
}
