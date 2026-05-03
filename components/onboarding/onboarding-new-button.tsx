'use client';

/**
 * "New onboarding" button + modal. Lives in the admin roster header
 * and the empty-state CTA. Picks a client + kind, optional platforms
 * (smm only), optional first POC email, then POSTs to
 * /api/admin/onboardings. On 201 redirects to the detail page.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ClientOption {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
}

const PLATFORMS = ['tiktok', 'instagram', 'youtube_shorts', 'linkedin', 'x'];

export function OnboardingNewButton({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [kind, setKind] = useState<'smm' | 'editing'>('smm');
  const [platforms, setPlatforms] = useState<string[]>(['tiktok', 'instagram']);
  const [pocEmail, setPocEmail] = useState('');
  const [sendWelcome, setSendWelcome] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clientId, clients],
  );

  function togglePlatform(slug: string) {
    setPlatforms((prev) =>
      prev.includes(slug) ? prev.filter((p) => p !== slug) : [...prev, slug],
    );
  }

  async function submit() {
    if (!clientId) {
      setError('Pick a client.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/onboardings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          kind,
          platforms: kind === 'smm' ? platforms : undefined,
          poc_email: pocEmail.trim() || undefined,
          send_welcome: sendWelcome,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? 'failed to create onboarding');
      }
      const { row } = (await res.json()) as { row: { id: string } };
      setOpen(false);
      router.push(`/admin/onboarding/${row.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} />
        New onboarding
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="New onboarding" maxWidth="lg">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={submitting}
              className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            >
              <option value="">Pick a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted">Kind</label>
            <div className="flex gap-2">
              {(['smm', 'editing'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  disabled={submitting}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                    kind === k
                      ? 'border-accent text-accent-text bg-background'
                      : 'border-border text-muted hover:bg-background'
                  }`}
                >
                  {k === 'smm' ? 'Social media' : 'Editing'}
                </button>
              ))}
            </div>
          </div>

          {kind === 'smm' && (
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-muted">Platforms</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    disabled={submitting}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      platforms.includes(p)
                        ? 'border-accent text-accent-text bg-background'
                        : 'border-border text-muted hover:bg-background'
                    }`}
                  >
                    {p.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted">
              POC email (optional)
            </label>
            <Input
              type="email"
              placeholder="Falls back to brand profile primary contact"
              value={pocEmail}
              onChange={(e) => setPocEmail(e.target.value)}
              disabled={submitting}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={sendWelcome}
              onChange={(e) => setSendWelcome(e.target.checked)}
              disabled={submitting}
              className="rounded border-border"
            />
            Send welcome email now
          </label>

          {error ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={submitting || !selectedClient}
            >
              {submitting ? 'Creating...' : 'Create onboarding'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
