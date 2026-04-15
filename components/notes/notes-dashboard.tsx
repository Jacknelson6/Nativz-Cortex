'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, User as UserIcon, Building2, Users, StickyNote } from 'lucide-react';
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
  routePrefix = '/admin',
}: {
  clients: { id: string; name: string; slug: string }[];
  isAdmin: boolean;
  /** Portal viewer mode: filter the board list and pre-scope new notes to
   *  this client id. Hides the scope picker in the create modal. */
  portalClientId?: string;
  /** Where board tiles link to — '/admin' for the admin surface,
   *  '/portal' for the portal. */
  routePrefix?: '/admin' | '/portal';
}) {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardCard[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    void load();
  }, [portalClientId]);

  async function load() {
    const qs = portalClientId ? `?clientId=${encodeURIComponent(portalClientId)}` : '';
    const res = await fetch(`/api/moodboard/notes-boards${qs}`);
    if (res.ok) {
      const d = await res.json();
      setBoards(d.boards ?? []);
    } else {
      setBoards([]);
    }
  }

  const grouped = (boards ?? []).reduce<Record<BoardCard['scope'], BoardCard[]>>(
    (acc, b) => {
      (acc[b.scope] ??= []).push(b);
      return acc;
    },
    { personal: [], client: [], team: [] },
  );

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
        <div className="space-y-8">
          {(['personal', 'team', 'client'] as const).map((scope) => {
            const list = grouped[scope];
            if (list.length === 0) return null;
            return (
              <section key={scope} className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                    {SCOPE_LABEL[scope]}
                  </h2>
                  <span className="text-xs text-text-muted/70">{list.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {list.map((b) => <BoardTile key={b.id} board={b} routePrefix={routePrefix} />)}
                </div>
              </section>
            );
          })}
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

function BoardTile({ board, routePrefix }: { board: BoardCard; routePrefix: '/admin' | '/portal' }) {
  const Icon = SCOPE_ICON[board.scope];
  const previews = board.thumbnails.slice(0, 4);
  return (
    <Link
      href={`${routePrefix}/notes/${board.id}`}
      className="group block overflow-hidden rounded-xl border border-nativz-border bg-surface transition-colors hover:border-accent/40"
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
