'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import { Button } from '@/components/ui/button';

type ClientOption = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  agency: 'anderson' | 'nativz' | null;
};

/**
 * /admin/proposals/builder (no draft) — start screen. Pick agency,
 * optionally tag a client, optionally set a title, then create the
 * draft and redirect to the split-pane builder.
 */
export function ProposalBuilderStart({
  clients,
  prefillClientId,
  prefillAgency,
  flowId,
}: {
  clients: ClientOption[];
  prefillClientId: string | null;
  prefillAgency: 'anderson' | 'nativz' | null;
  flowId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [agency, setAgency] = useState<'anderson' | 'nativz'>(prefillAgency ?? 'nativz');
  const [clientId, setClientId] = useState<string>(prefillClientId ?? '');
  const [title, setTitle] = useState('');
  const [paymentModel, setPaymentModel] = useState<'one_off' | 'subscription'>('subscription');

  async function go() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/proposals/drafts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agency,
          client_id: clientId || null,
          flow_id: flowId,
          title: title.trim() || undefined,
          payment_model: paymentModel,
          cadence: paymentModel === 'subscription' ? 'month' : null,
        }),
      });
      const json = (await res.json()) as
        | { ok: true; draft: { id: string } }
        | { ok: false; error: string };
      if (!res.ok || !('ok' in json) || !json.ok) {
        throw new Error('error' in json ? json.error : `failed (${res.status})`);
      }
      toast.success('Draft created');
      start(() => router.push(`/admin/proposals/builder?draft=${json.draft.id}`));
    } catch (err) {
      toast.error('Could not create draft', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const filteredClients = clients.filter((c) => !c.agency || c.agency === agency);
  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin · proposals
        </p>
        <h1 className="ui-page-title flex items-center gap-2">
          <Sparkles size={18} className="text-accent-text" />
          New chat-driven proposal
        </h1>
        <p className="text-sm text-text-muted">
          Build a custom proposal one service at a time, with deterministic pricing pulled from the catalog.
          Iterate live with the agent + the inline preview, then send when it's ready.
        </p>
      </header>

      <section className="rounded-xl border border-nativz-border bg-surface p-5 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAgency('anderson')}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              agency === 'anderson'
                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                : 'border-nativz-border bg-background text-text-muted hover:text-text-primary'
            }`}
          >
            Anderson Collaborative
          </button>
          <button
            type="button"
            onClick={() => setAgency('nativz')}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              agency === 'nativz'
                ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
                : 'border-nativz-border bg-background text-text-muted hover:text-text-primary'
            }`}
          >
            Nativz
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-text-muted uppercase tracking-wider">
            Client (optional)
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
          >
            <option value="">— No client linked (prospect)</option>
            {filteredClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {selectedClient && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-surface-hover/40">
              <ClientLogo src={selectedClient.logo_url} name={selectedClient.name} size="sm" />
              <span className="text-sm text-text-primary">{selectedClient.name}</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-text-muted uppercase tracking-wider">
            Title (optional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Acme Q3 social retainer"
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-text-muted uppercase tracking-wider">
            Payment model
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentModel('subscription')}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                paymentModel === 'subscription'
                  ? 'border-accent/40 bg-accent/10 text-accent-text'
                  : 'border-nativz-border bg-background text-text-muted hover:text-text-primary'
              }`}
            >
              Recurring retainer
            </button>
            <button
              type="button"
              onClick={() => setPaymentModel('one_off')}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                paymentModel === 'one_off'
                  ? 'border-accent/40 bg-accent/10 text-accent-text'
                  : 'border-nativz-border bg-background text-text-muted hover:text-text-primary'
              }`}
            >
              One-off project
            </button>
          </div>
        </div>

        <Button type="button" onClick={go} disabled={busy || pending} className="w-full gap-1.5">
          {busy || pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Start building
        </Button>
      </section>
    </div>
  );
}
