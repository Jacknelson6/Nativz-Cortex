'use client';

import { useState } from 'react';
import { Send, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface InviteButtonProps {
  clientId: string;
  clientName: string;
}

export function InviteButton({ clientId, clientName }: InviteButtonProps) {
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function handleCreateInvite() {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create invite');
        return;
      }

      setInviteUrl(data.invite_url);
      toast.success('Invite link generated');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success('Invite link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  if (inviteUrl) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-text-muted">
          Send this link to {clientName}. It expires in 7 days.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-xs text-text-secondary font-mono">
            {inviteUrl}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="cursor-pointer flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-nativz-border bg-surface-hover text-text-muted hover:bg-accent-surface hover:text-accent-text hover:border-accent/30 transition-colors"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setInviteUrl(null); setCopied(false); }}
          className="cursor-pointer text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Generate new link
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCreateInvite}
        disabled={loading}
        className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-nativz-border bg-surface-hover px-4 py-3 text-sm text-text-muted hover:border-accent/30 hover:text-accent-text hover:bg-accent-surface/30 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Send size={14} />
            Send invite to portal
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
