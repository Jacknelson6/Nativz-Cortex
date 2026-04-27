'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Inline "Start onboarding" CTA used on the client info page when no live
 * flow exists. POSTs to /api/onboarding/flows (idempotent) and redirects
 * to the flow detail page on success.
 */
export function StartFlowButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/onboarding/flows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; flowId: string; existing: boolean }
        | { error: string }
        | null;
      if (!res.ok || !json || 'error' in json) {
        const err = json && 'error' in json ? json.error : `failed (${res.status})`;
        toast.error("Couldn't start onboarding", { description: err });
        return;
      }
      if (!json.flowId) {
        toast.error("Couldn't start onboarding", { description: 'Server response missing flow id' });
        return;
      }
      toast.success(json.existing ? `Opening flow for ${clientName}` : `Started onboarding for ${clientName}`);
      startTransition(() => {
        router.push(`/admin/onboarding/${json.flowId}`);
        router.refresh();
      });
    } catch (err) {
      console.error('[start-flow-button] failed', err);
      toast.error("Couldn't start onboarding", {
        description: err instanceof Error ? err.message : 'Network error — please retry',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="sm" onClick={start} disabled={busy} className="gap-1.5 shrink-0">
      {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Rocket size={12} aria-hidden />}
      {busy ? 'Starting…' : 'Start onboarding'}
    </Button>
  );
}
