'use client';

import { useState, useCallback } from 'react';
import { Share2, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConversationShareButtonProps {
  conversationId: string | null;
  disabled?: boolean;
}

export function ConversationShareButton({
  conversationId,
  disabled,
}: ConversationShareButtonProps) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!conversationId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/nerd/conversations/${conversationId}/share`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        toast.error(err.error ?? 'Failed to create share link');
        return;
      }
      const data = await res.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        setCopied(true);
        toast.success('Share link copied to clipboard');
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setBusy(false);
    }
  }, [conversationId, busy]);

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={disabled || !conversationId || busy}
      className="flex h-8 items-center gap-1.5 rounded-lg border border-nativz-border bg-surface-hover/60 px-2.5 text-xs font-medium text-text-secondary transition hover:border-accent/30 hover:text-text-primary disabled:pointer-events-none disabled:opacity-40"
      title={copied ? 'Link copied!' : 'Copy share link'}
    >
      {busy ? (
        <Loader2 size={13} className="animate-spin" />
      ) : copied ? (
        <Check size={13} className="text-green-400" />
      ) : (
        <Share2 size={13} />
      )}
      {copied ? 'Copied' : 'Share'}
    </button>
  );
}
