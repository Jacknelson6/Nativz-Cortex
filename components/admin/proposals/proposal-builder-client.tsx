'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowUpRight,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';
import type { ServiceLine, CustomBlock } from '@/lib/proposals/draft-engine';

// ─── Types ────────────────────────────────────────────────────────────

type DraftRow = {
  id: string;
  agency: 'anderson' | 'nativz';
  client_id: string | null;
  title: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signer_title: string | null;
  signer_legal_entity: string | null;
  signer_address: string | null;
  service_lines: ServiceLine[];
  custom_blocks: CustomBlock[];
  payment_model: 'one_off' | 'subscription';
  cadence: 'week' | 'month' | 'quarter' | 'year' | null;
  subtotal_cents: number | null;
  total_cents: number | null;
  deposit_cents: number | null;
  status: string;
  committed_proposal_id: string | null;
  clients: { name: string | null; slug: string | null; logo_url: string | null } | { name: string | null; slug: string | null; logo_url: string | null }[] | null;
};

type CatalogService = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  billing_unit: string;
  base_unit_price_cents: number;
  included_items: string[];
};

const fmt = (c: number | null | undefined) =>
  c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

// ─── Component ────────────────────────────────────────────────────────

export function ProposalBuilderClient({
  draft: initialDraft,
  services,
}: {
  draft: DraftRow;
  services: CatalogService[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftRow>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0); // bump to refresh iframe
  const fileInputRef = useRef<HTMLInputElement>(null);

  const client = Array.isArray(draft.clients) ? draft.clients[0] : draft.clients;
  const previewUrl = `/admin/proposals/draft/${draft.id}/preview`;
  const cadenceWord = draft.cadence === 'year' ? 'year' : draft.cadence === 'week' ? 'week' : 'month';
  const isSub = draft.payment_model === 'subscription';
  const isCommitted = draft.status === 'committed';

  const reloadDraft = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/proposals/drafts/${draft.id}`);
      const json = await res.json();
      if (res.ok && json.ok) {
        setDraft(json.draft as DraftRow);
        setPreviewKey((k) => k + 1);
      }
    } catch {
      /* ignore — preview will be slightly stale until next mutation */
    }
  }, [draft.id]);

  // ── Service line mutations ───────────────────────────────────────

  const addService = useCallback(
    async (svc: CatalogService) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/proposals/drafts/${draft.id}/lines`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ service_slug: svc.slug, quantity: 1 }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'failed');
        const { draft: next } = (await res.json()) as { draft: DraftRow };
        setDraft(next);
        setPreviewKey((k) => k + 1);
      } catch (err) {
        toast.error('Could not add service', { description: err instanceof Error ? err.message : undefined });
      } finally {
        setBusy(false);
      }
    },
    [draft.id],
  );

  const updateLine = useCallback(
    async (lineId: string, patch: { quantity?: number; unit_price_cents?: number; remove?: boolean }) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/proposals/drafts/${draft.id}/lines`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ line_id: lineId, ...patch }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'failed');
        const { draft: next } = (await res.json()) as { draft: DraftRow };
        setDraft(next);
        setPreviewKey((k) => k + 1);
      } catch (err) {
        toast.error('Update failed', { description: err instanceof Error ? err.message : undefined });
      } finally {
        setBusy(false);
      }
    },
    [draft.id],
  );

  // ── Signer + payment model + title patches ────────────────────────

  const patchDraft = useCallback(
    async (patch: Partial<DraftRow>) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/proposals/drafts/${draft.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'failed');
        await reloadDraft();
      } catch (err) {
        toast.error('Save failed', { description: err instanceof Error ? err.message : undefined });
      } finally {
        setBusy(false);
      }
    },
    [draft.id, reloadDraft],
  );

  // ── Image upload (drop zone) ──────────────────────────────────────

  const uploadImage = useCallback(
    async (file: File, caption?: string) => {
      setBusy(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const upRes = await fetch(`/api/admin/proposals/drafts/${draft.id}/upload-image`, {
          method: 'POST',
          body: form,
        });
        if (!upRes.ok) throw new Error((await upRes.json().catch(() => ({}))).error || 'upload failed');
        const { url } = (await upRes.json()) as { url: string };
        const blockRes = await fetch(`/api/admin/proposals/drafts/${draft.id}/blocks`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'image', content: url, caption }),
        });
        if (!blockRes.ok) throw new Error((await blockRes.json().catch(() => ({}))).error || 'block insert failed');
        await reloadDraft();
        toast.success(`${file.name} added`);
      } catch (err) {
        toast.error('Image insert failed', { description: err instanceof Error ? err.message : undefined });
      } finally {
        setBusy(false);
      }
    },
    [draft.id, reloadDraft],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      if (f.type.startsWith('image/')) {
        await uploadImage(f);
      } else if (f.type === 'text/markdown' || f.name.endsWith('.md')) {
        const text = await f.text();
        const res = await fetch(`/api/admin/proposals/drafts/${draft.id}/blocks`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'markdown', content: text }),
        });
        if (res.ok) {
          await reloadDraft();
          toast.success(`${f.name} added as markdown block`);
        } else {
          toast.error('Could not insert markdown');
        }
      } else {
        toast.error('Drop an image or .md file');
      }
    },
    [draft.id, reloadDraft, uploadImage],
  );

  // ── Commit ────────────────────────────────────────────────────────

  const commit = useCallback(async () => {
    if (!confirm('Send this proposal? This creates the canonical record and emails the signer.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/proposals/drafts/${draft.id}/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ send_email: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `failed (${res.status})`);
      toast.success('Proposal sent');
      router.push(`/admin/proposals/${json.slug}`);
    } catch (err) {
      toast.error('Commit failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }, [draft.id, router]);

  // ── Catalog grouping ─────────────────────────────────────────────

  const grouped = useMemo(() => {
    const m = new Map<string, CatalogService[]>();
    for (const s of services) {
      const arr = m.get(s.category) ?? [];
      arr.push(s);
      m.set(s.category, arr);
    }
    return [...m.entries()].sort();
  }, [services]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      {/* LEFT: pickers */}
      <div className="lg:w-[42%] flex flex-col border-r border-nativz-border overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-nativz-border bg-surface/60">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/admin/proposals"
              className="text-text-muted hover:text-text-primary"
              title="Back to proposals"
            >
              <ArrowLeft size={15} />
            </Link>
            {client && (
              <>
                <ClientLogo src={client.logo_url ?? null} name={client.name ?? '?'} size="sm" />
                <span className="text-sm font-medium text-text-primary truncate">
                  {draft.title ?? client.name ?? 'Untitled'}
                </span>
              </>
            )}
            {!client && (
              <span className="text-sm font-medium text-text-primary truncate">
                {draft.title ?? 'Untitled draft'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/nerd?context=proposal:${draft.id}`}
              className="text-[11px] text-accent-text hover:underline"
            >
              Chat in Nerd →
            </Link>
            <Button
              type="button"
              size="sm"
              onClick={commit}
              disabled={busy || isCommitted || !draft.signer_email || draft.service_lines.length === 0}
              className="gap-1.5"
            >
              <Send size={12} />
              {isCommitted ? 'Sent' : 'Send to client'}
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Title + payment model */}
          <section className="space-y-2">
            <input
              type="text"
              value={draft.title ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              onBlur={() => patchDraft({ title: draft.title })}
              placeholder="Proposal title"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => patchDraft({ payment_model: 'subscription', cadence: 'month' })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isSub
                    ? 'border-accent/40 bg-accent/10 text-accent-text'
                    : 'border-nativz-border bg-background text-text-muted'
                }`}
              >
                Recurring
              </button>
              <button
                type="button"
                onClick={() => patchDraft({ payment_model: 'one_off', cadence: null })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  !isSub
                    ? 'border-accent/40 bg-accent/10 text-accent-text'
                    : 'border-nativz-border bg-background text-text-muted'
                }`}
              >
                One-off
              </button>
            </div>
            {isSub && (
              <select
                value={draft.cadence ?? 'month'}
                onChange={(e) => patchDraft({ cadence: e.target.value as never })}
                className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-xs text-text-primary"
              >
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Annually</option>
              </select>
            )}
          </section>

          {/* Service lines */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Service lines
            </h3>
            {draft.service_lines.length === 0 && (
              <p className="text-[12px] text-text-muted italic">
                Pick services from the catalog below to get started.
              </p>
            )}
            {draft.service_lines.map((line) => (
              <div key={line.id} className="rounded-lg border border-nativz-border bg-surface/40 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-text-primary truncate">{line.name_snapshot}</div>
                  <button
                    type="button"
                    onClick={() => updateLine(line.id, { remove: true })}
                    className="text-text-muted opacity-50 hover:opacity-100"
                    aria-label="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <NumberInput
                    label="Qty"
                    value={line.quantity}
                    onChange={(v) => updateLine(line.id, { quantity: v })}
                  />
                  <NumberInput
                    label="Unit $"
                    value={Math.round(line.unit_price_cents / 100)}
                    onChange={(v) => updateLine(line.id, { unit_price_cents: v * 100 })}
                  />
                  <div className="text-[11px] text-text-muted self-end pb-1">
                    Line: <span className="text-text-primary font-medium">{fmt(line.line_total_cents ?? line.unit_price_cents * line.quantity)}</span>
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* Catalog */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Catalog · {draft.agency === 'anderson' ? 'Anderson' : 'Nativz'}
            </h3>
            {grouped.map(([cat, list]) => (
              <div key={cat} className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/70 mt-2">{cat}</div>
                {list.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addService(s)}
                    disabled={busy}
                    className="block w-full text-left rounded-lg border border-nativz-border bg-background hover:bg-surface-hover px-3 py-2 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-text-primary">{s.name}</div>
                      <div className="text-xs text-accent-text font-medium">
                        {fmt(s.base_unit_price_cents)} / {s.billing_unit.replace('per_', '')}
                      </div>
                    </div>
                    {s.description && (
                      <div className="text-[11px] text-text-muted mt-0.5">{s.description}</div>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </section>

          {/* Signer */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Signer
            </h3>
            <input
              type="text"
              value={draft.signer_legal_entity ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, signer_legal_entity: e.target.value }))}
              onBlur={() => patchDraft({ signer_legal_entity: draft.signer_legal_entity })}
              placeholder="Legal entity (e.g. Acme Inc.)"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            />
            <input
              type="text"
              value={draft.signer_name ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, signer_name: e.target.value }))}
              onBlur={() => patchDraft({ signer_name: draft.signer_name })}
              placeholder="Signer name"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            />
            <input
              type="email"
              value={draft.signer_email ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, signer_email: e.target.value }))}
              onBlur={() => patchDraft({ signer_email: draft.signer_email })}
              placeholder="Signer email"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            />
            <input
              type="text"
              value={draft.signer_title ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, signer_title: e.target.value }))}
              onBlur={() => patchDraft({ signer_title: draft.signer_title })}
              placeholder="Signer title (e.g. CEO)"
              className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
            />
          </section>

          {/* Drop zone */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Drop content into the proposal
            </h3>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="block rounded-lg border-2 border-dashed border-nativz-border/60 bg-surface px-4 py-6 text-center cursor-pointer hover:bg-surface-hover/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,text/markdown,.md"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.type.startsWith('image/')) void uploadImage(f);
                  else if (f.type === 'text/markdown' || f.name.endsWith('.md'))
                    void f.text().then((text) =>
                      fetch(`/api/admin/proposals/drafts/${draft.id}/blocks`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ kind: 'markdown', content: text }),
                      }).then(() => reloadDraft()),
                    );
                  e.target.value = '';
                }}
              />
              <div className="flex flex-col items-center gap-2 text-text-muted">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                <p className="text-xs">Drop an image or .md file, or click to browse</p>
              </div>
            </label>
          </section>
        </div>

        {/* Totals footer */}
        <div className="border-t border-nativz-border bg-surface/80 px-5 py-3 space-y-1">
          {draft.subtotal_cents != null && draft.subtotal_cents !== draft.total_cents && (
            <div className="flex justify-between text-[12px] text-text-muted">
              <span>Subtotal</span>
              <span>{fmt(draft.subtotal_cents)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <span className="text-text-primary">{isSub ? `Recurring fee` : 'Total'}</span>
            <span className="text-accent-text">
              {isSub ? `${fmt(draft.total_cents)} / ${cadenceWord}` : fmt(draft.total_cents)}
            </span>
          </div>
          <div className="flex justify-between text-[12px] text-text-muted">
            <span>{isSub ? 'First charge' : 'Deposit'}</span>
            <span>{fmt(draft.deposit_cents)}</span>
          </div>
        </div>
      </div>

      {/* RIGHT: live preview */}
      <div className="flex-1 bg-zinc-100 overflow-hidden">
        <iframe
          key={previewKey}
          src={previewUrl}
          className="h-full w-full"
          title="Proposal preview"
        />
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <label className="text-[10px] uppercase tracking-wider text-text-muted block">
      {label}
      <input
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n >= 0 && n !== value) onChange(Math.round(n));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="mt-0.5 w-full rounded-md border border-nativz-border bg-background px-2 py-1 text-sm text-text-primary"
      />
    </label>
  );
}
