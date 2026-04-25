'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Sparkles, Loader2, Edit, Trash2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Service = {
  id: string;
  agency: 'anderson' | 'nativz';
  slug: string;
  name: string;
  category: string;
  description: string | null;
  scope_md: string | null;
  included_items: string[];
  billing_unit: string;
  base_unit_price_cents: number;
  default_quantity: number;
  active: boolean;
  updated_at: string;
};

type ExtractedService = {
  slug: string;
  name: string;
  category: 'social' | 'paid_media' | 'web' | 'creative' | 'strategy' | 'other';
  description: string | null;
  scope_md: string | null;
  included_items: string[];
  billing_unit: string;
  base_unit_price_cents: number;
  default_quantity: number;
};

const CATEGORIES = ['social', 'paid_media', 'web', 'creative', 'strategy', 'other'] as const;
const BILLING_UNITS = [
  'per_video',
  'per_post',
  'per_month',
  'per_year',
  'per_quarter',
  'flat',
  'per_hour',
  'per_unit',
] as const;

const fmt = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function ProposalServicesClient({ initialServices }: { initialServices: Service[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [services, setServices] = useState<Service[]>(initialServices);
  const [agency, setAgency] = useState<'anderson' | 'nativz'>('nativz');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);

  const filtered = useMemo(
    () => services.filter((s) => s.agency === agency),
    [services, agency],
  );
  const grouped = useMemo(() => {
    const m = new Map<string, Service[]>();
    for (const s of filtered) {
      const arr = m.get(s.category) ?? [];
      arr.push(s);
      m.set(s.category, arr);
    }
    return [...m.entries()].sort();
  }, [filtered]);

  async function handleCreate(svc: Omit<Service, 'id' | 'agency' | 'active' | 'updated_at'>) {
    const res = await fetch('/api/admin/proposal-services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...svc, agency }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      toast.error('Could not create service', { description: json.error });
      return false;
    }
    setServices((prev) => [...prev, json.service]);
    toast.success(`${svc.name} added`);
    start(() => router.refresh());
    return true;
  }

  async function handlePatch(id: string, patch: Partial<Service>) {
    const res = await fetch(`/api/admin/proposal-services/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error('Update failed', { description: j.error });
      return false;
    }
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    return true;
  }

  async function handleDelete(id: string) {
    if (!confirm('Archive this service? Existing drafts that reference it keep working.')) return;
    const res = await fetch(`/api/admin/proposal-services/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Archive failed');
      return;
    }
    setServices((prev) => prev.filter((s) => s.id !== id));
    toast.success('Archived');
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-text/80">
          Cortex · admin · proposals
        </p>
        <h1 className="ui-page-title">Service catalog</h1>
        <p className="ui-muted">
          Pricing repository the chat-driven proposal builder reads from. Edit prices any time —
          drafts created after the change use the new price; existing drafts keep their snapshot.
        </p>
      </header>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-nativz-border bg-surface p-1">
          {(['nativz', 'anderson'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAgency(a)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                agency === a ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {a === 'anderson' ? 'Anderson' : 'Nativz'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setExtractOpen((s) => !s)}>
            <Sparkles size={13} />
            Paste a proposal to extract
          </Button>
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus size={13} />
            Add service
          </Button>
        </div>
      </div>

      {extractOpen && (
        <ExtractPanel agency={agency} onClose={() => setExtractOpen(false)} onPick={(svc) => {
          setExtractOpen(false);
          setCreating(true);
          // Pre-fill via a tiny stash — the create form reads from sessionStorage on mount.
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('proposal-services:prefill', JSON.stringify(svc));
          }
        }} />
      )}

      {creating && (
        <ServiceForm
          mode="create"
          onCancel={() => setCreating(false)}
          onSubmit={async (svc) => {
            const ok = await handleCreate(svc);
            if (ok) setCreating(false);
          }}
        />
      )}

      <div className="space-y-4">
        {grouped.length === 0 && (
          <div className="rounded-xl border border-nativz-border bg-surface p-8 text-center text-sm text-text-muted">
            No services yet. Click <strong className="text-text-primary">Add service</strong> or paste a proposal to bulk-import.
          </div>
        )}
        {grouped.map(([cat, list]) => (
          <section key={cat} className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{cat}</h2>
            <div className="space-y-2">
              {list.map((s) =>
                editingId === s.id ? (
                  <ServiceForm
                    key={s.id}
                    mode="edit"
                    initial={s}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (patch) => {
                      const ok = await handlePatch(s.id, patch);
                      if (ok) setEditingId(null);
                    }}
                  />
                ) : (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg border border-nativz-border bg-surface px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-text-primary truncate">{s.name}</div>
                        <code className="font-mono text-[10px] text-text-muted/70">{s.slug}</code>
                      </div>
                      {s.description && (
                        <div className="text-[12px] text-text-muted truncate mt-0.5">{s.description}</div>
                      )}
                    </div>
                    <div className="text-sm font-medium text-accent-text shrink-0">
                      {fmt(s.base_unit_price_cents)} / {s.billing_unit.replace('per_', '')}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingId(s.id)}
                        className="p-1.5 text-text-muted hover:text-text-primary"
                        aria-label="Edit"
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="p-1.5 text-text-muted hover:text-red-400"
                        aria-label="Archive"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── Extract panel ───────────────────────────────────────────────────

function ExtractPanel({
  agency,
  onClose,
  onPick,
}: {
  agency: 'anderson' | 'nativz';
  onClose: () => void;
  onPick: (svc: ExtractedService) => void;
}) {
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<{ services: ExtractedService[] } | null>(null);

  async function go() {
    if (source.trim().length < 20) {
      toast.error('Paste at least a paragraph of proposal text');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/proposal-services/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agency, source }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'failed');
      setParsed(json.parsed as { services: ExtractedService[] });
    } catch (err) {
      toast.error('Extract failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-text-primary">Paste a proposal to extract services</div>
          <div className="text-[12px] text-text-muted">
            Paste plain text or markdown. The LLM picks out priced services + included items + suggested rules.
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-text-muted hover:text-text-primary">
          <X size={14} />
        </button>
      </div>
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        rows={8}
        placeholder="Paste proposal text here…"
        className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary font-mono"
      />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={go} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Extract
        </Button>
      </div>
      {parsed && (
        <div className="border-t border-nativz-border pt-3 space-y-2">
          <div className="text-[12px] text-text-muted">
            {parsed.services.length} service{parsed.services.length === 1 ? '' : 's'} found. Click to pre-fill the create form.
          </div>
          {parsed.services.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(s)}
              className="block w-full text-left rounded-lg border border-nativz-border bg-background hover:bg-surface-hover px-3 py-2 transition"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-text-primary">{s.name}</div>
                <div className="text-[12px] text-accent-text font-medium">
                  {fmt(s.base_unit_price_cents)} / {s.billing_unit.replace('per_', '')}
                </div>
              </div>
              {s.description && <div className="text-[11px] text-text-muted mt-0.5">{s.description}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Service form ────────────────────────────────────────────────────

function ServiceForm({
  mode,
  initial,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial?: Service;
  onCancel: () => void;
  onSubmit: (svc: Omit<Service, 'id' | 'agency' | 'active' | 'updated_at'>) => Promise<void>;
}) {
  const prefill = (() => {
    if (initial) return null;
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem('proposal-services:prefill');
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as ExtractedService;
      sessionStorage.removeItem('proposal-services:prefill');
      return v;
    } catch {
      return null;
    }
  })();

  const [form, setForm] = useState({
    slug: initial?.slug ?? prefill?.slug ?? '',
    name: initial?.name ?? prefill?.name ?? '',
    category: initial?.category ?? prefill?.category ?? 'social',
    description: initial?.description ?? prefill?.description ?? '',
    scope_md: initial?.scope_md ?? prefill?.scope_md ?? '',
    included_items: initial?.included_items ?? prefill?.included_items ?? [],
    billing_unit: initial?.billing_unit ?? prefill?.billing_unit ?? 'per_month',
    base_unit_price_cents: initial?.base_unit_price_cents ?? prefill?.base_unit_price_cents ?? 0,
    default_quantity: initial?.default_quantity ?? prefill?.default_quantity ?? 1,
  });
  const [includedDraft, setIncludedDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Name + slug are required');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(form);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">
          {mode === 'create' ? 'New service' : `Edit · ${initial?.name}`}
        </div>
        <button type="button" onClick={onCancel} className="p-1 text-text-muted hover:text-text-primary">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Name">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm"
          />
        </Field>
        <Field label="Slug">
          <input
            type="text"
            value={form.slug}
            disabled={mode === 'edit'}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
              }))
            }
            className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm font-mono disabled:opacity-50"
          />
        </Field>
        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as never }))}
            className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Billing unit">
          <select
            value={form.billing_unit}
            onChange={(e) => setForm((f) => ({ ...f, billing_unit: e.target.value }))}
            className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm"
          >
            {BILLING_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unit price ($)">
          <input
            type="number"
            min={0}
            value={Math.round(form.base_unit_price_cents / 100)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                base_unit_price_cents: Math.max(0, Math.round(Number(e.target.value) * 100)),
              }))
            }
            className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm font-mono"
          />
        </Field>
        <Field label="Default quantity">
          <input
            type="number"
            min={1}
            value={form.default_quantity}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                default_quantity: Math.max(1, Math.round(Number(e.target.value))),
              }))
            }
            className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm"
          />
        </Field>
      </div>

      <Field label="Description (one-liner)">
        <input
          type="text"
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm"
        />
      </Field>

      <Field label="Scope (markdown — renders in proposal)">
        <textarea
          value={form.scope_md ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, scope_md: e.target.value }))}
          rows={4}
          className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm font-mono"
        />
      </Field>

      <Field label="Included items">
        <div className="space-y-1">
          {form.included_items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-text-muted">•</span>
              <span className="flex-1 text-sm">{item}</span>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, included_items: f.included_items.filter((_, j) => j !== i) }))
                }
                className="text-text-muted opacity-50 hover:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={includedDraft}
              onChange={(e) => setIncludedDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && includedDraft.trim()) {
                  e.preventDefault();
                  setForm((f) => ({ ...f, included_items: [...f.included_items, includedDraft.trim()] }));
                  setIncludedDraft('');
                }
              }}
              placeholder="Type and press Enter…"
              className="flex-1 rounded-md border border-nativz-border bg-background px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={go} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {mode === 'create' ? 'Create' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
