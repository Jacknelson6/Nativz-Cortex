// SPY-09 T20: button that mints a presentation share-link and copies
// the URL to the clipboard. Dropped on the prospect detail page next
// to the Analyze / Generate scorecard CTAs.

'use client';

import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  prospectId: string;
}

export function PresentMintButton({ prospectId }: Props) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/present/mint-link`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? 'Failed to mint link');
        return;
      }
      try {
        await navigator.clipboard.writeText(body.url);
        toast.success('Presentation link copied to clipboard.');
      } catch {
        toast.success(`Link minted: ${body.url}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-md border border-nativz-border bg-surface-hover px-3 py-1.5 text-xs text-text-secondary hover:bg-surface disabled:opacity-50"
    >
      {busy ? 'Minting…' : 'Share presentation'}
    </button>
  );
}
