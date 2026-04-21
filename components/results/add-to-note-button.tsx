'use client';

import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Loader2, Plus, StickyNote } from 'lucide-react';
import { toast } from 'sonner';

/**
 * "Add to note" button for the TikTok carousel. Opens a small popover that
 * lists the caller's eligible notes boards and lets them file the video
 * into one. Works for both admin and portal surfaces because the backing
 * API (/api/moodboard/notes-boards and /api/analysis/items) resolves
 * visibility from the caller's role + user_client_access.
 */
interface NotesBoard {
  id: string;
  name: string;
  scope: 'personal' | 'client' | 'team';
  client_name: string | null;
}

interface AddToNoteButtonProps {
  /** Source video URL — used when we don't have a moodboard item id yet
   *  (analysis pipeline hasn't created one). We fall back to POSTing the
   *  raw URL to /api/analysis/items with the chosen board_id. */
  sourceUrl: string;
  /** The analysis item id — if the carousel has already created one for
   *  the topic-search analysis board, we reuse its URL to mint a new item
   *  on the destination board. The API dedupes by URL. */
  analysisItemId: string | null;
  /** Optional client context. When provided (typically in the portal where
   *  the current brand is known), the "New note" quick-action creates a
   *  client-scope board tied to this id. Admins without this prop get a
   *  personal-scope board by default. */
  clientId?: string | null;
}

export function AddToNoteButton({ sourceUrl, clientId }: AddToNoteButtonProps) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<NotesBoard[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Drop any cached board list if the active brand changes — otherwise a
  // list fetched for "Client A" would linger when the user pinned "Client B".
  useEffect(() => {
    setBoards(null);
  }, [clientId]);

  useEffect(() => {
    if (!open || boards !== null) return;
    (async () => {
      // Scope the board list to the active brand when one is in context
      // (portal: their bound brand; admin: the top-bar pill's clientId
      // gets passed in by the carousel). Without this the popover leaks
      // every cross-client note the caller can see — Jack flagged this
      // explicitly on 2026-04-21.
      const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
      const res = await fetch(`/api/moodboard/notes-boards${qs}`);
      if (!res.ok) {
        setBoards([]);
        return;
      }
      const data = await res.json();
      setBoards((data.boards ?? []) as NotesBoard[]);
    })();
  }, [open, boards, clientId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  async function addToBoard(boardId: string) {
    setSaving(boardId);
    try {
      const res = await fetch('/api/analysis/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: boardId, url: sourceUrl, type: 'video' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? 'Could not save to that note');
        return;
      }
      toast.success('Saved to note');
      setOpen(false);
    } catch {
      toast.error('Could not save to that note');
    } finally {
      setSaving(null);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      // If a clientId is supplied (portal context), create a client-scope
      // board for that brand. Otherwise fall back to a personal board,
      // which is what makes sense for admin users who don't have a
      // currently-active client in scope.
      const body = clientId
        ? { name, scope: 'client' as const, client_id: clientId }
        : { name, scope: 'personal' as const };
      const res = await fetch('/api/moodboard/notes-boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error('Could not create that note');
        return;
      }
      const data = await res.json();
      const id = data.board?.id as string | undefined;
      if (id) {
        await addToBoard(id);
        setBoards(null); // refetch next open
        setShowNewInput(false);
        setNewName('');
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-text transition-colors hover:border-accent/60 hover:bg-accent/20"
        title="Save this video to one of your notes"
      >
        <BookmarkPlus size={13} />
        Add to note
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-lg border border-nativz-border bg-surface shadow-elevated">
          <div className="px-3 py-2 border-b border-nativz-border/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Save to
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {boards === null ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-text-muted" />
              </div>
            ) : boards.length === 0 ? (
              <p className="px-3 py-3 text-xs text-text-muted">
                No notes yet. Create one below.
              </p>
            ) : (
              boards.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={saving === b.id}
                  onClick={() => void addToBoard(b.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <StickyNote size={13} className="shrink-0 text-text-muted" />
                  <span className="truncate flex-1">{b.name}</span>
                  {saving === b.id ? (
                    <Loader2 size={12} className="animate-spin text-text-muted" />
                  ) : b.client_name ? (
                    <span className="text-xs text-text-muted truncate max-w-24">{b.client_name}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>

          <div className="border-t border-nativz-border/40 p-2">
            {showNewInput ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void createAndAdd();
                    if (e.key === 'Escape') {
                      setShowNewInput(false);
                      setNewName('');
                    }
                  }}
                  placeholder="Note name"
                  className="flex-1 rounded-md border border-nativz-border bg-transparent px-2 py-1 text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/40"
                />
                <button
                  type="button"
                  onClick={() => void createAndAdd()}
                  disabled={creating || !newName.trim()}
                  className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
                >
                  {creating ? <Loader2 size={11} className="animate-spin" /> : 'Save'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewInput(true)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors cursor-pointer"
              >
                <Plus size={12} />
                New note
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
