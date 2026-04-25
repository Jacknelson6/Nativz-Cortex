'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Sparkles } from 'lucide-react';

type ClientOption = { id: string; name: string; slug: string };

type Template = {
  id: string;
  agency: 'anderson' | 'nativz';
  name: string;
  description: string | null;
  source_repo: string;
  source_folder: string;
  public_base_url: string;
  tiers_preview: Array<{ id: string; name: string; monthly_cents?: number; cadence?: string }>;
};

const formatCents = (c?: number) =>
  typeof c === 'number' ? `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';

export function NewProposalForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const [agencyFilter, setAgencyFilter] = useState<'all' | 'anderson' | 'nativz'>('all');
  const [showOptional, setShowOptional] = useState(false);
  const [form, setForm] = useState({
    template_id: '',
    client_id: '',
    signer_name: '',
    signer_email: '',
    signer_title: '',
    signer_legal_entity: '',
    signer_address: '',
    send_email: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/proposal-templates', { cache: 'no-store' });
        const json = (await res.json()) as { templates?: Template[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setTemplatesError(json.error ?? 'Could not load templates');
          setTemplatesLoading(false);
          return;
        }
        setTemplates(json.templates ?? []);
        if ((json.templates ?? []).length === 1) {
          setForm((f) => ({ ...f, template_id: json.templates![0].id }));
        }
      } catch (err) {
        if (!cancelled) setTemplatesError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTemplates =
    agencyFilter === 'all' ? templates : templates.filter((t) => t.agency === agencyFilter);
  const selectedTemplate = templates.find((t) => t.id === form.template_id) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.template_id) {
      setError('Pick a template.');
      return;
    }
    if (!form.signer_name.trim() || !form.signer_email.trim()) {
      setError('Signer name and email are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/proposals/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          template_id: form.template_id,
          client_id: form.client_id || null,
          signer_name: form.signer_name.trim(),
          signer_email: form.signer_email.trim(),
          signer_title: form.signer_title.trim() || null,
          signer_legal_entity: form.signer_legal_entity.trim() || null,
          signer_address: form.signer_address.trim() || null,
          send_email: form.send_email,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Generate failed (${res.status})`);
        setBusy(false);
        return;
      }
      router.push(`/admin/proposals/${json.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-text-primary">Template</h2>
          <p className="mt-1 text-xs text-text-muted">
            Cortex clones the branded proposal folder from the docs repo into a per-prospect slug,
            pre-fills the autofill pill, and emails the signer a &ldquo;Review &amp; sign&rdquo; link.
          </p>
        </header>
        {templatesLoading ? (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading templates…
          </p>
        ) : templatesError ? (
          <p className="text-sm text-coral-300">{templatesError}</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-text-muted">No templates configured.</p>
        ) : (
          <>
            <div className="mb-3 inline-flex rounded-full border border-nativz-border bg-background p-0.5 text-[11px]">
              {(['all', 'anderson', 'nativz'] as const).map((a) => {
                const label = a === 'all' ? 'All agencies' : a === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
                const count = a === 'all' ? templates.length : templates.filter((t) => t.agency === a).length;
                const active = agencyFilter === a;
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgencyFilter(a)}
                    className={`rounded-full px-3 py-1 transition ${
                      active
                        ? 'bg-nz-cyan/10 text-nz-cyan'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {label} <span className="ml-1 text-text-muted">({count})</span>
                  </button>
                );
              })}
            </div>
            {filteredTemplates.length === 0 ? (
              <p className="text-sm text-text-muted">No templates for this agency yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredTemplates.map((t) => {
              const selected = form.template_id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`template-card-${t.id}`}
                  onClick={() => setForm((f) => ({ ...f, template_id: t.id }))}
                  className={`rounded-lg border p-4 text-left transition ${
                    selected
                      ? 'border-nz-cyan bg-nz-cyan/5 shadow-[0_0_0_1px_rgba(34,211,238,0.4)]'
                      : 'border-nativz-border bg-background hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">
                        {t.agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz'}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">{t.name}</p>
                    </div>
                    {selected ? <Sparkles size={14} className="mt-0.5 text-nz-cyan" /> : null}
                  </div>
                  {t.description ? (
                    <p className="mt-2 text-xs text-text-secondary line-clamp-3">{t.description}</p>
                  ) : null}
                  {t.tiers_preview.length > 0 ? (
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      {t.tiers_preview.map((tier) => (
                        <div
                          key={tier.id}
                          className="rounded border border-nativz-border bg-background px-2 py-1.5 text-center"
                        >
                          <p className="text-[10px] uppercase tracking-wider text-text-muted">{tier.name}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-text-primary">
                            {formatCents(tier.monthly_cents)}
                            {tier.cadence === 'month' ? <span className="text-text-muted">/mo</span> : null}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-3 truncate text-[10px] text-text-muted">
                    {t.public_base_url}/<span className="text-text-secondary">{t.source_folder}</span>
                  </p>
                </button>
              );
            })}
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Signer</h2>
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="text-[11px] text-text-muted hover:text-text-primary"
          >
            {showOptional ? '— Hide optional fields' : '+ Optional fields'}
          </button>
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
              Signer name
            </span>
            <input
              type="text"
              required
              name="signer_name"
              value={form.signer_name}
              onChange={(e) => setForm((f) => ({ ...f, signer_name: e.target.value }))}
              className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
              Signer email
            </span>
            <input
              type="email"
              required
              name="signer_email"
              value={form.signer_email}
              onChange={(e) => setForm((f) => ({ ...f, signer_email: e.target.value }))}
              className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>
        {showOptional ? (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                Existing client (optional)
              </span>
              <select
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
              >
                <option value="">— Prospect (no client) —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                Signer title
              </span>
              <input
                type="text"
                value={form.signer_title}
                onChange={(e) => setForm((f) => ({ ...f, signer_title: e.target.value }))}
                placeholder="Owner, CEO"
                className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                Client legal entity
              </span>
              <input
                type="text"
                value={form.signer_legal_entity}
                onChange={(e) => setForm((f) => ({ ...f, signer_legal_entity: e.target.value }))}
                placeholder="Acme Inc."
                className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                Client address
              </span>
              <input
                type="text"
                value={form.signer_address}
                onChange={(e) => setForm((f) => ({ ...f, signer_address: e.target.value }))}
                placeholder="123 Main St, Miami FL 33130"
                className="w-full rounded border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
              />
            </label>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-text-muted">
            Optional fields (legal entity, address, existing client, title) pre-fill the autofill
            pill on the sign page so the signer types less.
          </p>
        )}
        <label className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={form.send_email}
            onChange={(e) => setForm((f) => ({ ...f, send_email: e.target.checked }))}
            className="accent-nz-cyan"
          />
          <span>Email the signer the &ldquo;Review &amp; sign&rdquo; link after generating.</span>
        </label>
      </section>


      {error ? <p className="text-sm text-coral-300" data-testid="generate-error">{error}</p> : null}

      <div className="flex justify-end">
        <button
          type="submit"
          data-testid="generate-submit"
          disabled={busy || !form.template_id}
          className="inline-flex items-center gap-2 rounded-full bg-nz-cyan px-5 py-2 text-xs font-semibold text-white hover:bg-nz-cyan/90 disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Send size={12} /> Generate {form.send_email ? '& send' : '(draft)'}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
