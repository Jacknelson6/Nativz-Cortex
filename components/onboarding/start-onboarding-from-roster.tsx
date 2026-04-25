'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search, Rocket } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import { Button } from '@/components/ui/button';

type ClientOption = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  agency: string | null;
  has_live_flow: boolean;
};

/**
 * Top-of-roster CTA for kicking off a new onboarding flow without
 * having to drill into a client first. Renders a "Start onboarding"
 * button that opens a brand picker dropdown. Clients with a live
 * (non-archived/completed) flow are dimmed since the unique partial
 * index forbids a second concurrent flow per client.
 *
 * Mirrors the per-client `<StartOnboardingButton/>` in the identity
 * header — same API call, same flow target — just discoverable from
 * the empty roster.
 */
export function StartOnboardingFromRoster({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
      .slice(0, 50);
  }, [clients, query]);

  async function go(client: ClientOption) {
    if (busyId) return;
    setBusyId(client.id);
    try {
      const res = await fetch('/api/onboarding/flows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
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
      toast.success(json.existing ? `Opening existing flow for ${client.name}` : `Started onboarding for ${client.name}`);
      setOpen(false);
      startTransition(() => {
        router.push(`/admin/onboarding/${json.flowId}`);
        router.refresh();
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen((s) => !s)}
        className="gap-1.5"
      >
        <Plus size={14} />
        Start onboarding
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-96 rounded-xl border border-nativz-border bg-surface shadow-xl">
          <div className="border-b border-nativz-border p-2">
            <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-background px-2.5 py-1.5">
              <Search size={13} className="text-text-muted" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pick a brand…"
                className="flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-[12px] text-text-muted">No matches.</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => go(c)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-hover disabled:opacity-50"
                  >
                    <ClientLogo src={c.logo_url} name={c.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-text-primary">{c.name}</div>
                      <div className="text-[11px] text-text-muted">
                        {c.has_live_flow ? 'Live flow exists — opens it' : 'No flow yet — creates one'}
                      </div>
                    </div>
                    <Rocket size={13} className="text-accent-text shrink-0" />
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-nativz-border p-2 text-right">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-text-muted hover:text-text-primary"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
