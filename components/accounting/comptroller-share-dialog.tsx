'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Trash2, Shield, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface TokenRow {
  id: string;
  token: string;
  role: 'comptroller' | 'ceo';
  label: string | null;
  expires_at: string;
  first_viewed_at: string | null;
  viewer_name: string | null;
  viewer_email: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  periodId: string;
  periodLabel: string;
}

/**
 * Mint + manage read-only payroll view links. Admin pastes the URL into
 * whatever channel (email, Slack) the Comptroller / CEO actually uses.
 */
export function ComptrollerShareDialog({ open, onClose, periodId, periodLabel }: Props) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState<'comptroller' | 'ceo' | null>(null);
  const [label, setLabel] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/periods/${periodId}/view-tokens`);
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as { tokens: TokenRow[] };
      setTokens(data.tokens ?? []);
    } catch {
      toast.error('Could not load share links');
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function handleMint(role: 'comptroller' | 'ceo') {
    setMinting(role);
    try {
      const res = await fetch(`/api/accounting/periods/${periodId}/view-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, label: label.trim() || undefined, days: 30 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to mint link');
        return;
      }
      try {
        await navigator.clipboard.writeText(data.url);
        toast.success('Share link copied to clipboard');
      } catch {
        toast.success('Share link minted');
      }
      setLabel('');
      await refresh();
    } finally {
      setMinting(null);
    }
  }

  async function handleCopy(token: string) {
    const url = `${window.location.origin}/comptroller/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed — select the URL manually');
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this link? The Comptroller / CEO will see an "expired" page next time they open it.')) return;
    const res = await fetch(`/api/accounting/periods/${periodId}/view-tokens?token_id=${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      toast.error('Revoke failed');
      return;
    }
    toast.success('Link revoked');
    await refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Share read-only view" maxWidth="2xl">
      <p className="-mt-2 mb-5 text-sm text-text-secondary">
        Mint a tokenized link for the Comptroller or CEO to see {periodLabel} totals without
        a Supabase login. 30-day expiry, revocable.
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-text-muted">
            Label (optional)
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Alex (CPA)"
            className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleMint('comptroller')}
              disabled={minting !== null}
            >
              {minting === 'comptroller' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Shield size={14} />
              )}
              Mint comptroller link
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleMint('ceo')}
              disabled={minting !== null}
            >
              {minting === 'ceo' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Crown size={14} />
              )}
              Mint CEO link
            </Button>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Active links
          </h3>
          {loading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-text-muted">No links minted yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {tokens.map((t) => {
                const expired = new Date(t.expires_at).getTime() < Date.now();
                const revoked = !!t.revoked_at;
                return (
                  <li
                    key={t.id}
                    className={`flex items-center gap-3 rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm ${
                      revoked || expired ? 'opacity-60' : ''
                    }`}
                  >
                    <span className="inline-flex items-center gap-1 rounded-full border border-nativz-border/80 bg-surface px-2 py-0.5 text-[11px] font-medium capitalize text-text-secondary">
                      {t.role}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">
                        {t.label ?? `${t.role} link`}
                      </p>
                      <p className="truncate text-[11px] text-text-muted">
                        Expires {new Date(t.expires_at).toLocaleDateString()}
                        {t.first_viewed_at ? (
                          <>
                            {' · '}
                            <span className="text-emerald-400">
                              viewed {new Date(t.first_viewed_at).toLocaleDateString()}
                            </span>
                          </>
                        ) : (
                          ' · not opened yet'
                        )}
                        {revoked ? ' · revoked' : expired ? ' · expired' : ''}
                      </p>
                    </div>
                    {!revoked && !expired && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleCopy(t.token)}
                          className="rounded-md border border-nativz-border bg-surface px-2 py-1 text-xs font-medium text-text-secondary hover:border-accent/40 hover:text-text-primary"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRevoke(t.id)}
                          className="rounded-md border border-nativz-border bg-surface px-2 py-1 text-xs font-medium text-text-muted hover:border-red-500/40 hover:text-red-300"
                          title="Revoke"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                    {(revoked || expired) && (
                      <Check size={14} className="text-text-muted/50" aria-hidden />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
