'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

/**
 * Self-saving toggle row used inside WorkspaceSection. Hits the main
 * /api/clients/[id] PATCH endpoint with `{ [field]: boolean }`. Optimistic
 * UI: flips immediately, rolls back on failure.
 */
export function NotificationToggleRow({
  clientId,
  field,
  label,
  description,
  initial,
}: {
  clientId: string;
  field: string;
  label: string;
  description?: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setEnabled(!next);
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-3.5 border-b border-nativz-border/60 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {description && (
          <div className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={enabled}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          enabled ? 'bg-accent' : 'bg-nativz-border'
        } disabled:opacity-60`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
        {pending && (
          <Loader2
            size={10}
            className="absolute -right-4 top-1/2 -translate-y-1/2 animate-spin text-text-muted"
          />
        )}
      </button>
    </div>
  );
}
