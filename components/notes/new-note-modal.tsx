'use client';

import { useEffect, useState } from 'react';
import { User as UserIcon, Building2, Users, Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Scope = 'personal' | 'client' | 'team';

/**
 * Create-note modal. Picks scope (personal / client / team) + optional client,
 * names the board, and POSTs to /api/moodboard/notes-boards. On success the
 * parent navigates to /notes/[id].
 */
export function NewNoteModal({
  open,
  onClose,
  clients,
  isAdmin,
  onCreated,
  forcedClientId,
}: {
  open: boolean;
  onClose: () => void;
  clients: { id: string; name: string; slug: string }[];
  isAdmin: boolean;
  onCreated: (boardId: string) => void;
  /** Portal viewers: scope and client are locked to this id — the scope
   *  picker and client dropdown are hidden so the UX is a single "name
   *  your note" field. */
  forcedClientId?: string;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>(forcedClientId ? 'client' : 'personal');
  const [clientId, setClientId] = useState<string>(forcedClientId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setScope(forcedClientId ? 'client' : 'personal');
      setClientId(forcedClientId ?? '');
      setError(null);
      setSubmitting(false);
    }
  }, [open, forcedClientId]);

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
        return;
      }
      const d = await res.json();
      onCreated(d.board.id);
    } catch {
      setError('Network error — try again');
    } finally {
      setSubmitting(false);
    }
  }

  const scopeOptions: { value: Scope; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; hint: string; disabled?: boolean }[] = [
    { value: 'personal', label: 'Personal', icon: UserIcon, hint: 'Only you can see this note' },
    { value: 'team', label: 'Team', icon: Users, hint: 'Shared across the whole agency', disabled: !isAdmin },
    { value: 'client', label: 'Client', icon: Building2, hint: 'Attached to a client workspace', disabled: !isAdmin },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="New note" maxWidth="md">
      <div className="space-y-5">
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

        {!forcedClientId && (
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
        )}

        {!forcedClientId && scope === 'client' && (
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

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-nativz-border">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={submitting || !name.trim()}>
            {submitting && <Loader2 size={13} className="animate-spin" />}
            Create note
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
