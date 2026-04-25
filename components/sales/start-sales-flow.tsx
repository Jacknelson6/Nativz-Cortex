'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search, Rocket, UserPlus, Building2 } from 'lucide-react';
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
 * Sales-pipeline start CTA. Two tabs in one dropdown:
 *
 *   - **Existing client** — pick a brand we already track. If it has a
 *     live flow, opens it; otherwise creates a fresh flow.
 *   - **New prospect** — enter brand name + signer info. Creates a thin
 *     clients row (lifecycle='lead') + a `needs_proposal` flow, then
 *     routes the admin to the flow detail page where they can attach a
 *     proposal next. The auto-create path in `createProposalDraft` is
 *     the same shape but triggers from `/admin/proposals/new` if the
 *     admin skips this picker entirely — both endpoints end at "real
 *     clients row + linked flow".
 *
 * Service-stack awareness (Social as the first service the admin can
 * attach) lives on the flow detail page — once we have the flow, the
 * admin clicks "+ Add segment" there. The dropdown stays narrow so
 * service catalogs don't bloat its width.
 */
export function StartSalesFlow({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'existing' | 'prospect'>('existing');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  // Prospect tab form state.
  const [prospectName, setProspectName] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [agency, setAgency] = useState<'anderson' | 'nativz'>('anderson');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
      .slice(0, 50);
  }, [clients, query]);

  async function pickExisting(client: ClientOption) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/onboarding/flows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; flowId: string; existing: boolean }
        | { ok: false; error: string }
        | { error: string }
        | null;
      const ok = res.ok && json && (('ok' in json && json.ok) || (!('ok' in json) && !('error' in json)));
      if (!ok) {
        const err = json && 'error' in json ? json.error : `failed (${res.status})`;
        toast.error("Couldn't start onboarding", { description: err });
        return;
      }
      const flowId = (json as { flowId: string }).flowId;
      const existing = (json as { existing?: boolean }).existing ?? false;
      toast.success(
        existing ? `Opening existing flow for ${client.name}` : `Started onboarding for ${client.name}`,
      );
      setOpen(false);
      startTransition(() => {
        router.push(`/admin/onboarding/${flowId}`);
        router.refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  async function createProspect() {
    if (busy) return;
    const name = prospectName.trim();
    if (name.length < 2) {
      toast.error('Brand name required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/sales/prospects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          agency,
          signerName: signerName.trim() || undefined,
          signerEmail: signerEmail.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; flowId: string; clientId: string }
        | { error: string }
        | null;
      if (!res.ok || !json || 'error' in json) {
        const err = json && 'error' in json ? json.error : `failed (${res.status})`;
        toast.error("Couldn't create prospect", { description: err });
        return;
      }
      toast.success(`Welcomed ${name}`);
      setOpen(false);
      setProspectName('');
      setSignerName('');
      setSignerEmail('');
      startTransition(() => {
        router.push(`/admin/onboarding/${json.flowId}`);
        router.refresh();
      });
    } finally {
      setBusy(false);
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
        Start
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-[26rem] rounded-xl border border-nativz-border bg-surface shadow-xl">
          {/* Tab switcher */}
          <div className="flex border-b border-nativz-border">
            <button
              type="button"
              onClick={() => setTab('existing')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium transition ${
                tab === 'existing'
                  ? 'bg-accent/10 text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover'
              }`}
            >
              <Building2 size={12} />
              Existing client
            </button>
            <button
              type="button"
              onClick={() => setTab('prospect')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium transition ${
                tab === 'prospect'
                  ? 'bg-accent/10 text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover'
              }`}
            >
              <UserPlus size={12} />
              New prospect
            </button>
          </div>

          {tab === 'existing' ? (
            <>
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
                        disabled={busy}
                        onClick={() => pickExisting(c)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-hover disabled:opacity-50"
                      >
                        <ClientLogo src={c.logo_url} name={c.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-text-primary">{c.name}</div>
                          <div className="text-[11px] text-text-muted">
                            {c.has_live_flow
                              ? 'Live flow exists — opens it'
                              : 'No flow yet — creates one'}
                          </div>
                        </div>
                        <Rocket size={13} className="text-accent-text shrink-0" />
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : (
            <div className="space-y-2.5 p-3">
              <p className="text-[11px] text-text-muted">
                Welcome a fresh prospect. We&apos;ll create a lead row and an empty flow so you can attach a proposal next.
              </p>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                  Brand name
                </span>
                <input
                  type="text"
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  placeholder="Acme Co."
                  className="w-full rounded-lg border border-nativz-border bg-background px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                  Signer name (optional)
                </span>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-lg border border-nativz-border bg-background px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                  Signer email (optional)
                </span>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="jane@acme.co"
                  className="w-full rounded-lg border border-nativz-border bg-background px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                  Agency
                </span>
                <select
                  value={agency}
                  onChange={(e) => setAgency(e.target.value as 'anderson' | 'nativz')}
                  className="w-full rounded-lg border border-nativz-border bg-background px-2.5 py-1.5 text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40"
                >
                  <option value="anderson">Anderson Collaborative</option>
                  <option value="nativz">Nativz</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-[11px] text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || prospectName.trim().length < 2}
                  onClick={createProspect}
                  className="gap-1.5"
                >
                  <Rocket size={12} />
                  Create + open flow
                </Button>
              </div>
            </div>
          )}

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
