'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, UserPlus, Copy, Check, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export function InvitePortalButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to create invite');
        return;
      }
      const data = await res.json();
      setInviteUrl(data.invite_url ?? data.invites?.[0]?.invite_url ?? null);
      setOpen(true);
    } catch {
      toast.error('Failed to create invite');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success('Invite link copied');
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setOpen(false);
    setInviteUrl(null);
    setCopied(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
        Invite to portal
      </button>

      <Dialog open={open} onClose={handleClose} title="Invite to portal" maxWidth="sm">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Link2 size={14} className="shrink-0" />
            <span>Share this link with your client to give them access to their portal.</span>
          </div>
          {inviteUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface-hover px-3 py-2.5">
              <span className="flex-1 min-w-0 truncate text-sm font-mono text-text-primary">
                {inviteUrl}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
                title="Copy link"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          )}
          <p className="text-xs text-text-muted">
            This link expires in 7 days. Manage existing invites in{' '}
            <Link href="#" onClick={handleClose} className="text-accent-text hover:underline">
              settings
            </Link>
            .
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              Close
            </Button>
            <Button type="button" size="sm" onClick={handleCopy} disabled={!inviteUrl}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy link'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
