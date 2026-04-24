'use client';

/**
 * Inline client picker for the "Open in Strategy Lab" button on an
 * unattached topic search. Lets the user attach the search to one of
 * their clients, then navigates into the lab with the search pre-pinned.
 *
 * The dialog owns the fetch of /api/clients (admin sees all, portal users
 * see their org), the PATCH to attach, and the router.push at the end.
 * Reuses the Dialog primitive from components/ui/dialog so the chrome is
 * consistent with the rest of the app.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { contentLabTopicSearchStorageKey } from '@/lib/content-lab/topic-search-selection-storage';

interface ContentLabAttachClientDialogProps {
  open: boolean;
  onClose: () => void;
  searchId: string;
}

interface ClientOption {
  id: string;
  name: string;
  slug: string;
}

export function ContentLabAttachClientDialog({
  open,
  onClose,
  searchId,
}: ContentLabAttachClientDialogProps) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/clients')
      .then((r) => r.json() as Promise<{ clients?: ClientOption[] } | ClientOption[]>)
      .then((data) => {
        if (cancelled) return;
        // /api/clients may return either an array directly or { clients: [...] }
        const rows = Array.isArray(data) ? data : (data.clients ?? []);
        setClients(
          rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
        );
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load clients');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [filter, clients]);

  async function handlePick(client: ClientOption) {
    if (attaching) return;
    setAttaching(true);
    try {
      const res = await fetch(`/api/search/${searchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Could not attach this search to that client');
        return;
      }
      // Pre-pin as the ONLY selection so Strategy Lab auto-attaches it
      // on mount, matching the attached-case behavior in results-client.tsx.
      try {
        const key = contentLabTopicSearchStorageKey(client.id);
        window.localStorage.setItem(key, JSON.stringify([searchId]));
      } catch {
        /* quota / JSON — non-fatal */
      }
      toast.success(`Attached to ${client.name}`);
      router.push(`/lab/${client.id}`);
    } finally {
      setAttaching(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Attach search to a client"
      maxWidth="md"
      bodyClassName="p-0"
    >
      <div className="border-b border-white/[0.06] px-5 py-4">
        <p className="text-sm text-text-muted">
          Strategy Lab sessions are scoped to a client. Pick the brand this research
          belongs to and we&apos;ll attach the search and jump you into the lab.
        </p>
      </div>
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <Search size={14} className="shrink-0 text-text-muted" />
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search clients…"
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none"
        />
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            Loading clients…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-text-muted">
            {clients.length === 0 ? 'No clients found.' : 'No matches — try a different term.'}
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={attaching}
                  onClick={() => void handlePick(c)}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">{c.name}</div>
                    <div className="truncate text-xs text-text-muted">{c.slug}</div>
                  </div>
                  {attaching ? (
                    <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />
                  ) : (
                    <span className="shrink-0 text-xs text-accent-text">Open lab →</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
