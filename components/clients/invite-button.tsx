'use client';

import { useState } from 'react';
import { Send, Copy, Check, Loader2, Mail, Link2 } from 'lucide-react';
import { toast } from 'sonner';

interface InviteButtonProps {
  clientId: string;
  clientName: string;
}

type EmailStatus = 'sent' | 'failed' | 'skipped' | null;

/**
 * Two flows: (1) generate a copy-able link to share manually, or
 * (2) email the branded invite directly from Cortex (agency-themed).
 * The agency brand is resolved server-side from `clients.agency`.
 */
export function InviteButton({ clientId, clientName }: InviteButtonProps) {
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Direct-email form state
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');

  async function createInvite(payload: { email?: string; contact_name?: string }) {
    setError('');
    setEmailStatus(null);
    setLoading(true);

    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, ...payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create invite');
        return;
      }

      setInviteUrl(data.invite_url);
      const status = (data.email_status ?? 'skipped') as EmailStatus;
      setEmailStatus(status);

      if (status === 'sent') {
        toast.success(`Invite emailed to ${payload.email}`);
      } else if (status === 'failed') {
        toast.error(`Could not send email: ${data.email_error ?? 'unknown error'}`);
      } else {
        toast.success('Invite link generated');
      }
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

  function reset() {
    setInviteUrl(null);
    setCopied(false);
    setEmailStatus(null);
    setEmail('');
    setContactName('');
  }

  if (inviteUrl) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-text-muted">
          {emailStatus === 'sent'
            ? `Invite emailed to ${email || clientName}. Link also copyable below — expires in 7 days.`
            : `Send this link to ${clientName}. It expires in 7 days.`}
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
          onClick={reset}
          className="cursor-pointer text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Generate new invite
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Direct-email form — primary path. */}
      <div className="space-y-2 rounded-xl border border-nativz-border bg-surface/40 p-3">
        <p className="text-xs font-medium text-text-primary">Email the invite</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contact name (optional)"
            className="rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
            disabled={loading}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
            disabled={loading}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const trimmed = email.trim();
            if (!trimmed) {
              setError('Enter an email address');
              return;
            }
            void createInvite({ email: trimmed, contact_name: contactName.trim() || undefined });
          }}
          disabled={loading || !email.trim()}
          className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-lg border border-accent/35 bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          {loading ? 'Sending…' : 'Send invite'}
        </button>
      </div>

      {/* Link-only fallback. */}
      <button
        type="button"
        onClick={() => void createInvite({})}
        disabled={loading}
        className="cursor-pointer flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-nativz-border bg-surface-hover px-4 py-3 text-sm text-text-muted hover:border-accent/30 hover:text-accent-text hover:bg-accent-surface/30 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Link2 size={14} />
            Just give me a link
          </>
        )}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
