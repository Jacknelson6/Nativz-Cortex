'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import { cn } from '@/lib/utils/cn';

interface MentionClient {
  id: string;
  name: string;
  slug: string;
  agency?: string | null;
  avatarUrl?: string | null;
}

interface StrategyLabClientPickerPillProps {
  /** The client the lab is currently open for. */
  clientId: string;
  clientName: string;
  clientSlug: string;
  /** When the user picks a different client, the pill navigates to its
   *  Strategy Lab route. The parent doesn't need to react. */
}

/**
 * Strategy Lab header client picker — same logo-grid UX the Research page
 * Brand popover uses. Opens a dropdown listing every active client as a
 * clickable ClientLogo tile; picking one routes to /admin/strategy-lab/<slug>.
 *
 * Pulls the full client list lazily from /api/nerd/mentions (already returns
 * every active client with avatarUrl: c.logo_url) so we don't have to plumb
 * the client roster down through the Strategy Lab workspace props.
 */
export function StrategyLabClientPickerPill({
  clientId,
  clientName,
  clientSlug,
}: StrategyLabClientPickerPillProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<MentionClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Resolve the active client out of the loaded list so we can show its logo
  // in the trigger pill even before the user opens the dropdown. Seeded with
  // what the parent already knows.
  const activeClient = useMemo<MentionClient>(
    () => ({
      id: clientId,
      name: clientName,
      slug: clientSlug,
      avatarUrl:
        clients.find((c) => c.id === clientId)?.avatarUrl ?? null,
    }),
    [clientId, clientName, clientSlug, clients],
  );

  // Lazy-load the full client list the first time the user opens the picker.
  useEffect(() => {
    if (!open || clients.length > 0) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/nerd/mentions')
      .then((r) => r.json())
      .then((data: { clients?: MentionClient[] }) => {
        if (cancelled) return;
        setClients(data.clients ?? []);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, clients.length]);

  // Close on outside click / Escape — same pattern as the other pickers in
  // this chat component.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const pickClient = useCallback(
    (client: MentionClient) => {
      setOpen(false);
      if (client.id === clientId) return;
      // /admin/strategy-lab/[clientId] loads by UUID, not slug.
      router.push(`/admin/strategy-lab/${client.id}`);
    },
    [clientId, router],
  );

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.slug?.toLowerCase().includes(q) ?? false),
    );
  }, [clients, search]);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'group inline-flex h-9 max-w-[min(100%,14rem)] min-w-0 items-center gap-2 rounded-full border border-nativz-border bg-surface-hover/60 px-2 pr-3 text-left text-xs font-medium text-text-secondary shadow-sm transition',
          open
            ? 'border-accent/35 bg-surface-hover text-text-primary'
            : 'hover:border-accent/35 hover:bg-surface-hover hover:text-text-primary',
        )}
      >
        <ClientLogo
          src={activeClient.avatarUrl}
          name={activeClient.name}
          size="sm"
          className="h-7 w-7 shrink-0 !rounded-md"
        />
        <span className="truncate text-text-primary">{activeClient.name}</span>
        <ChevronDown
          size={13}
          className={cn('shrink-0 text-text-muted transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-nativz-border bg-surface shadow-elevated">
          <div className="border-b border-nativz-border p-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                aria-hidden
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="w-full rounded-lg border border-nativz-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {loading ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-hover" />
                ))}
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
                <Loader2 className="hidden" />
                <p className="text-sm text-text-muted">No matching clients</p>
              </div>
            ) : (
              <div
                className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2"
                role="listbox"
                aria-label="Clients"
              >
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={c.id === clientId}
                    onClick={() => pickClient(c)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border border-transparent p-2 text-center transition-colors hover:bg-surface-hover',
                      c.id === clientId && 'border-accent/35 bg-accent/10',
                    )}
                  >
                    <ClientLogo
                      src={c.avatarUrl}
                      name={c.name}
                      size="sm"
                      className="shrink-0 rounded-lg"
                    />
                    <span className="line-clamp-2 w-full text-[10px] font-medium leading-tight text-text-primary">
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
