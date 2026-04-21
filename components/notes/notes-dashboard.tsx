'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, User as UserIcon, Building2, Users, StickyNote, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { NewNoteModal } from './new-note-modal';

interface BoardCard {
  id: string;
  name: string;
  description: string | null;
  scope: 'personal' | 'client' | 'team';
  client_name: string | null;
  updated_at: string;
  item_count: number;
  thumbnails: string[];
}

const SCOPE_LABEL: Record<BoardCard['scope'], string> = {
  personal: 'Personal',
  team: 'Team',
  client: 'Client',
};
const SCOPE_ICON: Record<BoardCard['scope'], React.ComponentType<{ size?: number; className?: string }>> = {
  personal: UserIcon,
  team: Users,
  client: Building2,
};

/**
 * Dashboard at /admin/notes. Lists every Notes board the caller has access
 * to, grouped by scope. Create flow opens a modal that picks scope +
 * (optionally) client, then navigates to /admin/notes/[id] on success.
 */
export function NotesDashboard({
  clients,
  isAdmin,
  portalClientId,
  adminScopedClientId,
  routePrefix = '/admin',
}: {
  clients: { id: string; name: string; slug: string }[];
  isAdmin: boolean;
  /** Portal viewer mode: filter the board list and pre-scope new notes to
   *  this client id. Hides the scope picker in the create modal. */
  portalClientId?: string;
  /** NAT-57: admin's session brand (from the top-bar pill). Filters the
   *  board list to that brand's scope + personal notes. When null,
   *  shows everything. Does NOT hide the scope picker in create — admin
   *  can still pick any scope for a new note. */
  adminScopedClientId?: string | null;
  /** Where board tiles link to — '/admin' for the admin surface,
   *  '/portal' for the portal. */
  routePrefix?: '/admin' | '/portal';
}) {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardCard[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // The fetch filter: portal uses its hard-bound client id; admin uses
  // the session brand when pinned. One source of truth for the query.
  const filterClientId = portalClientId ?? adminScopedClientId ?? null;

  useEffect(() => {
    void load();
  }, [filterClientId]);

  async function load() {
    const qs = filterClientId ? `?clientId=${encodeURIComponent(filterClientId)}` : '';
    const res = await fetch(`/api/moodboard/notes-boards${qs}`);
    if (res.ok) {
      const d = await res.json();
      setBoards(d.boards ?? []);
    } else {
      setBoards([]);
    }
  }

  // Flat, updated-first list. Scope labels used to live in group headers
  // ("CLIENT · 3", "PERSONAL · 1"); Jack asked to drop that visual noise on
  // 2026-04-21 since the scope icon + client name already tell the same
  // story per-tile.
  const orderedBoards = [...(boards ?? [])].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  async function handleDelete(boardId: string, boardName: string) {
    if (!window.confirm(`Delete "${boardName}"? This can't be undone.`)) return;
    // Optimistic removal — re-load on error so the tile reappears.
    const prev = boards;
    setBoards((cur) => (cur ?? []).filter((b) => b.id !== boardId));
    const res = await fetch(`/api/analysis/boards/${boardId}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to delete note');
      setBoards(prev);
      return;
    }
    toast.success('Note deleted');
  }

  return (
    <div className="cortex-page-gutter max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="ui-page-title flex items-center gap-2">
            <StickyNote size={22} className="text-accent-text" />
            Notes
          </h1>
          <p className="text-base text-text-muted mt-1">
            Paste TikToks, Reels, Shorts, or any URL onto a board. Draw, connect, and break down the clips.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer"
        >
          <Plus size={14} />
          New note
        </button>
      </div>

      {boards === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-surface-elevated animate-pulse" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <EmptyState onCreate={() => setNewOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {orderedBoards.map((b) => (
            <BoardTile
              key={b.id}
              board={b}
              routePrefix={routePrefix}
              onDelete={() => handleDelete(b.id, b.name)}
            />
          ))}
        </div>
      )}

      <NewNoteModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        clients={clients}
        isAdmin={isAdmin}
        forcedClientId={portalClientId}
        onCreated={(id) => {
          setNewOpen(false);
          router.push(`${routePrefix}/notes/${id}`);
        }}
      />
    </div>
  );
}

function BoardTile({
  board,
  routePrefix,
  onDelete,
}: {
  board: BoardCard;
  routePrefix: '/admin' | '/portal';
  onDelete?: () => void | Promise<void>;
}) {
  const Icon = SCOPE_ICON[board.scope];
  const previews = board.thumbnails.slice(0, 4);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group relative">
      <Link
        href={`${routePrefix}/notes/${board.id}`}
        className="block overflow-hidden rounded-xl border border-nativz-border bg-surface transition-colors hover:border-accent/40"
      >
        <div className="aspect-video overflow-hidden bg-background grid grid-cols-2 grid-rows-2 gap-px">
          {previews.length === 0 ? (
            <div className="col-span-2 row-span-2 flex items-center justify-center">
              <StickyNote size={28} className="text-text-muted/30" />
            </div>
          ) : (
            previews.map((src, i) => (
              <div
                key={i}
                className={`bg-surface-hover ${previews.length === 1 ? 'col-span-2 row-span-2' : previews.length === 2 ? 'col-span-1 row-span-2' : ''}`}
                style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            ))
          )}
        </div>
        <div className="p-3.5">
          <div className="flex items-center gap-2">
            <Icon size={13} className="shrink-0 text-text-muted" />
            <p className="truncate text-sm font-medium text-text-primary">{board.name}</p>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
            <span className="truncate">
              {board.client_name ?? SCOPE_LABEL[board.scope]}
            </span>
            <span>{board.item_count} item{board.item_count === 1 ? '' : 's'}</span>
          </div>
        </div>
      </Link>
      {onDelete && (
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={deleting}
          aria-label="Delete note"
          title="Delete note"
          className="absolute top-2 right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/85 text-text-muted opacity-0 shadow-sm backdrop-blur-sm transition-all duration-150 hover:bg-red-500/90 hover:text-white focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-nativz-border bg-surface/40 px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface/40">
        <StickyNote size={22} className="text-accent-text" />
      </div>
      <p className="mt-3 text-base font-medium text-text-primary">No notes yet</p>
      <p className="mt-1 text-sm text-text-muted max-w-md mx-auto">
        Notes are boards where you can paste TikToks, Reels, Shorts, images, and websites. Create one to get started.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer"
      >
        <Plus size={14} />
        Create your first note
      </button>
    </div>
  );
}
