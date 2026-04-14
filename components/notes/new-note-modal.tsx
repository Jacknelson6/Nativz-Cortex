'use client';

import { useEffect, useState } from 'react';
import { X, User as UserIcon, Building2, Users, Loader2 } from 'lucide-react';

type Scope = 'personal' | 'client' | 'team';

/**
 * Create-note modal. Picks scope (personal / client / team) + optional client,
 * names the board, and POSTs to /api/moodboard/notes-boards. On success the
 * parent navigates to /admin/notes/[id].
 */
export function NewNoteModal({
  open,
  onClose,
  clients,
  isAdmin,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clients: { id: string; name: string; slug: string }[];
  isAdmin: boolean;
  onCreated: (boardId: string) => void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('personal');
  const [clientId, setClientId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setName('');
      setScope('personal');
      setClientId('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    if (!name.trim()) {
      setError('Give your note a name');
      return;
    }
    if (scope === 'client' && !clientId) {
      setError('Pick a client for a client-scope note');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/moodboard/notes-boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scope,
          ...(scope === 'client' ? { client_id: clientId } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Failed to create note');
        setSubmitting(false);
        return;
      }
      const d = await res.json();
      onCreated(d.board.id);
    } catch {
      setError('Network error — try again');
      setSubmitting(false);
    }
  }

  const scopeOptions: { value: Scope; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; hint: string; disabled?: boolean }[] = [
    { value: 'personal', label: 'Personal', icon: UserIcon, hint: 'Only you can see this note' },
    { value: 'team', label: 'Team', icon: Users, hint: 'Shared across the whole agency', disabled: !isAdmin },
    { value: 'client', label: 'Client', icon: Building2, hint: 'Attached to a client workspace', disabled: !isAdmin },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-nativz-border bg-surface shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-nativz-border">
          <h2 className="text-base font-semibold text-text-primary">New note</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-text-muted mb-1.5">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) void submit(); }}
              placeholder="e.g. Reels I want to copy"
              className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-text-muted mb-2">
              Who can see it
            </label>
            <div className="space-y-1.5">
              {scopeOptions.map((opt) => {
                const Icon = opt.icon;
                const selected = scope === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => setScope(opt.value)}
                    className={`w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? 'border-accent/40 bg-accent-surface/30'
                        : 'border-nativz-border bg-surface hover:bg-surface-hover'
                    } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <Icon size={16} className="mt-0.5 shrink-0 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">{opt.label}</p>
                      <p className="text-xs text-text-muted mt-0.5">{opt.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {scope === 'client' && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-text-muted mb-1.5">
                Client
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/40 cursor-pointer"
              >
                <option value="">Pick a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-nativz-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-text-secondary cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            Create note
          </button>
        </div>
      </div>
    </div>
  );
}
