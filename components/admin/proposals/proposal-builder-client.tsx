'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Loader2,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';
import { ProposalBuilderChat } from '@/components/admin/proposals/proposal-builder-chat';
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

/**
 * Three-pane builder:
 *   - Left:   inline chat (the primary surface)
 *   - Middle: collapsible quick-add drawer — catalog click-to-add,
 *             service-line list with qty/unit-$ inline editors, signer
 *             fields, payment model, totals. Default-collapsed; admin
 *             expands when they want manual control.
 *   - Right:  live preview iframe pointing at /admin/proposals/draft/[id]/preview
 *
 * Every mutation through the chat or the manual panel bumps `previewKey`
 * so the iframe re-renders.
 */
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
  const [previewKey, setPreviewKey] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);

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
      /* preview will be slightly stale until next mutation */
    }
  }, [draft.id]);

  // Called after every chat turn that ran a tool, OR after every manual
  // mutation — both reload the canonical draft state and bump the iframe.
  const onDraftMutated = useCallback(() => {
    void reloadDraft();
  }, [reloadDraft]);

  // ── Service-line + signer + payment-model mutations (manual) ───────

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
        toast.error('Could not add service', {
          description: err instanceof Error ? err.message : undefined,
        });
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

  const commit = useCallback(async () => {
    if (!confirm('Send this proposal? Creates the canonical record + emails the signer.')) return;
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

  // ── Catalog grouping ────────────────────────────────────────────

  const grouped = useMemo(() => {
    const m = new Map<string, CatalogService[]>();
    for (const s of services) {
      const arr = m.get(s.category) ?? [];
      arr.push(s);
      m.set(s.category, arr);
    }
    return [...m.entries()].sort();
  }, [services]);

  const agencyName = draft.agency === 'anderson' ? 'Anderson' : 'Nativz';

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      {/* LEFT: chat */}
      <div className="lg:w-[38%] flex flex-col border-r border-nativz-border min-w-0">
        <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-nativz-border bg-surface/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/admin/proposals"
              className="text-text-muted hover:text-text-primary"
              title="Back to proposals"
            >
              <ArrowLeft size={15} />
            </Link>
            {client && (
              <ClientLogo src={client.logo_url ?? null} name={client.name ?? '?'} size="sm" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">
                {draft.title ?? client?.name ?? 'Untitled'}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                {agencyName} · {draft.status}
              </div>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={commit}
            disabled={busy || isCommitted || !draft.signer_email || draft.service_lines.length === 0}
            className="gap-1.5 shrink-0"
          >
            <Send size={12} />
            {isCommitted ? 'Sent' : 'Send'}
          </Button>
        </header>

        <div className="flex-1 min-h-0">
          <ProposalBuilderChat
            draftId={draft.id}
            agencyName={agencyName}
            onDraftMutated={onDraftMutated}
          />
        </div>

        {/* Compact totals bar — always visible. */}
        <div className="border-t border-nativz-border bg-surface/80 px-4 py-2 shrink-0">
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-text-primary">{isSub ? `Recurring` : 'Total'}</span>
            <span className="text-accent-text">
              {isSub ? `${fmt(draft.total_cents)} / ${cadenceWord}` : fmt(draft.total_cents)}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-text-muted">
            <span>{isSub ? 'First charge' : 'Deposit'}</span>
            <span>{fmt(draft.deposit_cents)}</span>
          </div>
        </div>
      </div>

      {/* MIDDLE: collapsible quick-add drawer */}
      {manualOpen && (
        <div className="lg:w-[24%] flex flex-col border-r border-nativz-border bg-surface/40 min-w-0">
          <header className="flex items-center justify-between px-4 py-2.5 border-b border-nativz-border shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Quick add
            </div>
            <button
              type="button"
              onClick={() => setManualOpen(false)}
              className="text-text-muted hover:text-text-primary text-[11px]"
            >
              Hide
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
            {/* Service lines */}
            {draft.service_lines.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  In this proposal
                </h3>
                {draft.service_lines.map((line) => (
                  <div key={line.id} className="rounded-lg border border-nativz-border bg-background p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-medium text-text-primary truncate">
                        {line.name_snapshot}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateLine(line.id, { remove: true })}
                        className="text-text-muted opacity-50 hover:opacity-100"
                        aria-label="Remove"
                      >
                        <Trash2 size={11} />
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
                      <div className="text-[10px] text-text-muted self-end pb-1">
                        {fmt(line.line_total_cents ?? line.unit_price_cents * line.quantity)}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Catalog */}
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Catalog
              </h3>
              {grouped.map(([cat, list]) => (
                <div key={cat} className="space-y-1">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-text-muted/70 mt-2">{cat}</div>
                  {list.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => addService(s)}
                      disabled={busy}
                      className="block w-full text-left rounded-lg border border-nativz-border bg-background hover:bg-surface-hover px-2.5 py-1.5 transition disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12px] font-medium text-text-primary truncate">{s.name}</div>
                        <div className="text-[11px] text-accent-text font-medium shrink-0">
                          {fmt(s.base_unit_price_cents)}/{s.billing_unit.replace('per_', '')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </section>

            {/* Payment model */}
            <section className="space-y-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Payment</h3>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => patchDraft({ payment_model: 'subscription', cadence: 'month' })}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                    isSub ? 'border-accent/40 bg-accent/10 text-accent-text' : 'border-nativz-border bg-background text-text-muted'
                  }`}
                >
                  Recurring
                </button>
                <button
                  type="button"
                  onClick={() => patchDraft({ payment_model: 'one_off', cadence: null })}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                    !isSub ? 'border-accent/40 bg-accent/10 text-accent-text' : 'border-nativz-border bg-background text-text-muted'
                  }`}
                >
                  One-off
                </button>
              </div>
              {isSub && (
                <select
                  value={draft.cadence ?? 'month'}
                  onChange={(e) => patchDraft({ cadence: e.target.value as never })}
                  className="w-full rounded-md border border-nativz-border bg-background px-2 py-1 text-[11px] text-text-primary"
                >
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                  <option value="year">Annually</option>
                </select>
              )}
            </section>

            {/* Signer */}
            <section className="space-y-1.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Signer</h3>
              <input
                type="text"
                value={draft.signer_legal_entity ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, signer_legal_entity: e.target.value }))}
                onBlur={() => patchDraft({ signer_legal_entity: draft.signer_legal_entity })}
                placeholder="Legal entity"
                className="w-full rounded-md border border-nativz-border bg-background px-2 py-1.5 text-[12px] text-text-primary"
              />
              <input
                type="text"
                value={draft.signer_name ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, signer_name: e.target.value }))}
                onBlur={() => patchDraft({ signer_name: draft.signer_name })}
                placeholder="Signer name"
                className="w-full rounded-md border border-nativz-border bg-background px-2 py-1.5 text-[12px] text-text-primary"
              />
              <input
                type="email"
                value={draft.signer_email ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, signer_email: e.target.value }))}
                onBlur={() => patchDraft({ signer_email: draft.signer_email })}
                placeholder="Signer email"
                className="w-full rounded-md border border-nativz-border bg-background px-2 py-1.5 text-[12px] text-text-primary"
              />
              <input
                type="text"
                value={draft.signer_title ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, signer_title: e.target.value }))}
                onBlur={() => patchDraft({ signer_title: draft.signer_title })}
                placeholder="Signer title"
                className="w-full rounded-md border border-nativz-border bg-background px-2 py-1.5 text-[12px] text-text-primary"
              />
            </section>
          </div>
        </div>
      )}

      {/* Toggle button when collapsed — anchored to the left edge of the preview pane. */}
      {!manualOpen && (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="hidden lg:flex shrink-0 self-stretch items-center justify-center w-7 border-r border-nativz-border bg-surface/40 text-text-muted hover:text-text-primary hover:bg-surface-hover/50"
          title="Show quick-add panel"
        >
          <ChevronRightIcon size={14} />
        </button>
      )}
      {manualOpen ? null : null}

      {/* RIGHT: live preview. Outside the iframe is the page-background
          matte; the iframe interior renders the proposal on its own paper
          backdrop (mirrors the canonical signed PDF). */}
      <div className="flex-1 bg-background overflow-hidden relative min-w-0">
        {!manualOpen && (
          <div className="absolute top-2 left-2 z-10">
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="rounded-md border border-nativz-border bg-surface/95 backdrop-blur px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
              title="Open quick-add panel"
            >
              <ChevronDown size={11} className="inline mr-1" />
              Quick add
            </button>
          </div>
        )}
        {busy && (
          <div className="absolute top-2 right-2 z-10 rounded-md border border-nativz-border bg-surface/95 backdrop-blur px-2 py-1 text-[11px] text-text-muted flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" /> Updating
          </div>
        )}
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
    <label className="text-[9px] uppercase tracking-wider text-text-muted block">
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
        className="mt-0.5 w-full rounded border border-nativz-border bg-background px-1.5 py-0.5 text-[12px] text-text-primary"
      />
    </label>
  );
}
