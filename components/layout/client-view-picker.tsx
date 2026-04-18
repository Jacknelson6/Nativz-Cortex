'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Search, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  slug: string;
  organization_id: string;
  logo_url?: string | null;
  agency?: string | null;
}

interface ClientViewPickerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal client picker for the "Client view" menu item. Lists every client
 * the current admin can impersonate, filters client-side by name/slug, and
 * starts impersonation via /api/impersonate on pick.
 *
 * Intentionally *not* using the Command-K palette: this is a one-off
 * admin-action surface, and reusing the palette would mean loading its
 * store + keybindings for a flow that happens maybe 5 times a day.
 */
export function ClientViewPicker({ open, onClose }: ClientViewPickerProps) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [query, setQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open || clients !== null) return;
    setLoadingList(true);
    fetch('/api/clients')
      .then((res) => (res.ok ? res.json() : { clients: [] }))
      .then((data) => setClients(data.clients ?? []))
      .catch(() => setClients([]))
      .finally(() => setLoadingList(false));
  }, [open, clients]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients ?? [];
    return (clients ?? []).filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q)
      );
    });
  }, [clients, query]);

  async function handlePick(client: Client) {
    setPickingId(client.id);
    try {
      const res = await fetch('/api/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: client.organization_id,
          client_slug: client.slug,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to start client view');
        return;
      }
      const data = await res.json();
      window.location.href = data.redirect ?? '/portal';
    } catch {
      toast.error('Something went wrong');
    } finally {
      setPickingId(null);
    }
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 pt-24 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-nativz-border bg-surface shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-nativz-border">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">View a client's portal</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-b border-nativz-border">
          <Search size={14} className="text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            autoFocus
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loadingList ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading clients…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted text-center">
              {clients && clients.length === 0 ? 'No clients yet.' : 'No matches.'}
            </p>
          ) : (
            <ul>
              {filtered.map((client) => {
                const isPicking = pickingId === client.id;
                return (
                  <li key={client.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(client)}
                      disabled={pickingId !== null}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-hover disabled:opacity-60 cursor-pointer transition-colors"
                    >
                      {client.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={client.logo_url}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover bg-surface"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-surface-hover flex items-center justify-center text-text-muted text-xs font-semibold">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
                        <p className="text-xs text-text-muted truncate">/{client.slug}</p>
                      </div>
                      {isPicking && <Loader2 size={14} className="animate-spin text-text-muted" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-nativz-border text-[11px] text-text-muted">
          Opens the selected client's portal with an impersonation banner.
        </div>
      </div>
    </div>,
    document.body,
  );
}
