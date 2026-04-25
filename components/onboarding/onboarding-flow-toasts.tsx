'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Rocket } from 'lucide-react';

/**
 * Persistent bottom-left toast stack for "Start onboarding" prompts.
 *
 * Lives in the admin layout so it survives navigation. Each card maps to
 * one onboarding_flows row in `needs_proposal` status that the current
 * admin created and hasn't dismissed. Clicking the card opens the flow
 * builder. Hitting × dismisses just the toast — the flow itself stays
 * in the onboarding roster.
 */

export type PendingFlowToast = {
  flow_id: string;
  client_id: string;
  client_name: string;
  client_slug: string;
  client_logo: string | null;
  created_at: string;
};

export function OnboardingFlowToasts({ initial }: { initial: PendingFlowToast[] }) {
  const [toasts, setToasts] = useState<PendingFlowToast[]>(initial);
  const [, startTransition] = useTransition();
  const router = useRouter();

  if (toasts.length === 0) return null;

  async function dismiss(flowId: string) {
    setToasts((prev) => prev.filter((t) => t.flow_id !== flowId));
    try {
      await fetch(`/api/onboarding/flows/${flowId}/dismiss-toast`, { method: 'POST' });
    } catch {
      // Optimistic — leave it dismissed locally even if the request fails;
      // the next page load reflects authoritative state.
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col-reverse gap-2">
      {toasts.map((t) => (
        <div
          key={t.flow_id}
          className="pointer-events-auto group flex w-80 items-start gap-3 rounded-xl border border-accent/30 bg-surface/95 p-3 shadow-lg backdrop-blur"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-text">
            <Rocket size={15} />
          </div>
          <Link
            href={`/admin/onboarding/${t.flow_id}`}
            className="flex-1 min-w-0 text-left"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-text">
              Start onboarding
            </div>
            <div className="mt-0.5 text-sm font-medium text-text-primary truncate">
              {t.client_name}
            </div>
            <div className="text-[12px] text-text-muted">
              Build the flow — proposal, segments, POC.
            </div>
          </Link>
          <button
            type="button"
            onClick={() => dismiss(t.flow_id)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 text-text-muted opacity-60 transition hover:bg-surface-hover hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
