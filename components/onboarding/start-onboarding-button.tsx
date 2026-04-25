'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Kick off an onboarding flow for a client. Idempotent — if a live flow
 * already exists, the API returns the existing id and we navigate to it.
 * On a fresh create, the persistent toast in the admin layout starts
 * tracking it, so even if the admin doesn't click through immediately,
 * the next page load reminds them.
 */
export function StartOnboardingButton({
  clientId,
  clientName,
  variant = 'default',
}: {
  clientId: string;
  clientName: string;
  variant?: 'default' | 'compact';
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  async function go() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/onboarding/flows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; flowId: string; existing: boolean }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !json || json.ok === false) {
        const err = json && 'error' in json ? json.error : `failed (${res.status})`;
        toast.error(`Couldn't start onboarding`, { description: err });
        return;
      }
      if (json.existing) {
        toast.success(`${clientName} already has an onboarding flow.`, {
          description: 'Opening it now.',
        });
      } else {
        toast.success(`Started onboarding for ${clientName}.`, {
          description: 'Build the flow — proposal, segments, POC.',
        });
      }
      start(() => {
        router.push(`/admin/onboarding/${json.flowId}`);
        router.refresh();
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={go}
      disabled={submitting || pending}
      size={variant === 'compact' ? 'sm' : 'md'}
      variant="outline"
      className="gap-1.5"
    >
      <Rocket size={14} />
      Start onboarding
    </Button>
  );
}
