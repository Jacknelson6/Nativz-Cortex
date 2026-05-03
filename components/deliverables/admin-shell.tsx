'use client';

/**
 * AdminShell — per-(client, type) deliverables admin replacing
 * `CreditsAdminPanel`.
 *
 * Layout:
 *   • Type tabs across the top (one per balance row, including hasRow=false
 *     placeholders so the admin can provision a brand new type inline).
 *   • Selected tab renders: monthly allowance editor, manual grant form,
 *     pause / resume controls, and the per-type recent ledger.
 *
 * The Phase A API routes already accept `deliverable_type_slug` so this
 * component just plumbs the active slug through every action. Rendering
 * stays presentational, all DB work flows through `/api/credits/[id]/...`.
 *
 * One concession to the directional pivot: internal labels still say
 * "credits" because this is an admin-only surface and the team thinks in
 * accounting terms here. Anything client-facing routes through
 * `lib/deliverables/copy.ts`.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DeliverableBalance } from '@/lib/deliverables/get-balances';
import type {
  CreditTransactionKind,
  CreditTransactionRow,
  RolloverPolicy,
} from '@/lib/credits/types';
import { deliverableCopy } from '@/lib/deliverables/copy';
import { AdminMarginView } from './admin-margin-view';

/**
 * Sentinel slug for the "Margin" pseudo-tab. We piggyback on the existing
 * tab-button rendering by giving it a slug value that can never collide
 * with a real `deliverable_types.slug` (those are alphanumeric without
 * leading underscores).
 */
const MARGIN_SLUG = '__margin__';

interface AdminShellProps {
  clientId: string;
  balances: DeliverableBalance[];
  /**
   * Recent transactions across ALL types. The shell filters per-tab using
   * `deliverable_type_id`. Pre-sorted DESC by `created_at`.
   */
  transactions: CreditTransactionRow[];
}

const KIND_LABEL: Record<CreditTransactionKind, string> = {
  grant_monthly: 'Monthly grant',
  grant_topup: 'Top-up',
  consume: 'Consumed',
  refund: 'Refund',
  adjust: 'Adjustment',
  expire: 'Expired',
};

const POLICY_LABEL: Record<RolloverPolicy, string> = {
  none: 'None, reset to allowance each cycle',
  cap: 'Cap, carry over up to a limit',
  unlimited: 'Unlimited, keep everything',
};

export function AdminShell({ clientId, balances, transactions }: AdminShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Stable tab order. We sort by sortOrder so the admin sees the same
  // sequence as the client surface.
  const sorted = useMemo(
    () => balances.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [balances],
  );
  // Widened to string so we can host a sentinel slug ("__margin__") for the
  // pseudo-tab alongside real `DeliverableTypeSlug` values.
  const [activeSlug, setActiveSlug] = useState<string>(
    sorted[0]?.deliverableTypeSlug ?? 'edited_video',
  );

  const active = sorted.find((b) => b.deliverableTypeSlug === activeSlug) ?? sorted[0];

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grantDelta, setGrantDelta] = useState<string>('');
  const [grantNote, setGrantNote] = useState<string>('');
  const [grantKind, setGrantKind] = useState<'grant_topup' | 'adjust'>('grant_topup');
  const [pauseReason, setPauseReason] = useState<string>('');
  const [pauseUntil, setPauseUntil] = useState<string>('');
  const [allowance, setAllowance] = useState<string>(String(active?.monthlyAllowance ?? 0));
  const [rolloverPolicy, setRolloverPolicy] = useState<RolloverPolicy>(
    active?.rolloverPolicy ?? 'none',
  );
  const [rolloverCap, setRolloverCap] = useState<string>(String(active?.rolloverCap ?? 0));

  // When the active tab switches, snap the form values to the new row so
  // the admin doesn't accidentally edit Type A's allowance into Type B.
  useMemo(() => {
    setAllowance(String(active?.monthlyAllowance ?? 0));
    setRolloverPolicy(active?.rolloverPolicy ?? 'none');
    setRolloverCap(String(active?.rolloverCap ?? 0));
    setError(null);
    setGrantDelta('');
    setGrantNote('');
    setPauseReason('');
    setPauseUntil('');
  }, [active]);

  const isPausedIndefinite = active?.autoGrantEnabled === false;
  const isPausedTimeBound =
    !!active?.pausedUntil && new Date(active.pausedUntil).getTime() > Date.now();
  const paused = isPausedIndefinite || isPausedTimeBound;
  const hasRow = !!active?.hasRow;

  const tabTx = useMemo(
    () =>
      transactions
        .filter((t) => t.deliverable_type_id === active?.deliverableTypeId)
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [transactions, active?.deliverableTypeId],
  );

  async function call(
    label: string,
    fetcher: () => Promise<Response>,
    onSuccess?: (json: unknown) => void,
  ) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetcher();
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new Error(
          (json && (json as { error?: string }).error) || `Request failed (${res.status})`,
        );
      }
      onSuccess?.(json);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  async function submitGrant() {
    const delta = Number(grantDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      setError('Delta must be a non-zero integer.');
      return;
    }
    await call('grant', () =>
      fetch(`/api/credits/${clientId}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: grantKind,
          delta,
          note: grantNote.trim() || undefined,
          deliverable_type_slug: activeSlug,
        }),
      }),
    );
    setGrantDelta('');
    setGrantNote('');
  }

  async function submitPause(timeBound: boolean) {
    if (!pauseReason.trim()) {
      setError('Pause reason is required.');
      return;
    }
    if (timeBound && !pauseUntil) {
      setError('Pause-until date is required.');
      return;
    }
    await call('pause', () =>
      fetch(`/api/credits/${clientId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          timeBound
            ? {
                paused_until: new Date(pauseUntil).toISOString(),
                pause_reason: pauseReason.trim(),
                deliverable_type_slug: activeSlug,
              }
            : {
                auto_grant_enabled: false,
                pause_reason: pauseReason.trim(),
                deliverable_type_slug: activeSlug,
              },
        ),
      }),
    );
  }

  async function submitResume() {
    await call('resume', () =>
      fetch(`/api/credits/${clientId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: true, deliverable_type_slug: activeSlug }),
      }),
    );
  }

  async function submitAllowance() {
    const a = Number(allowance);
    if (!Number.isInteger(a) || a < 0) {
      setError('Allowance must be a non-negative integer.');
      return;
    }
    let cap: number | null = null;
    if (rolloverPolicy === 'cap') {
      const c = Number(rolloverCap);
      if (!Number.isInteger(c) || c < 0) {
        setError('Rollover cap must be a non-negative integer.');
        return;
      }
      cap = c;
    }
    await call('allowance', () =>
      fetch(`/api/credits/${clientId}/allowance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_allowance: a,
          rollover_policy: rolloverPolicy,
          rollover_cap: rolloverPolicy === 'cap' ? cap : null,
          deliverable_type_slug: activeSlug,
        }),
      }),
    );
  }

  return (
    <>
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-coral-300/30 bg-coral-300/5 p-3 text-sm text-coral-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : null}

      {/* Tabs: one per type plus a Margin pseudo-tab. hasRow=false rows still
          appear so the admin can provision them; saving the allowance creates
          the row. */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-nativz-border bg-surface p-1">
        {sorted.map((b) => {
          const copy = deliverableCopy(b.deliverableTypeSlug);
          const isActive = b.deliverableTypeSlug === activeSlug;
          return (
            <button
              key={b.deliverableTypeId}
              type="button"
              onClick={() => setActiveSlug(b.deliverableTypeSlug)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-[color:var(--accent-contrast)]'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {copy.shortLabel}
              {!b.hasRow ? (
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] uppercase ${
                    isActive ? 'bg-white/20' : 'bg-amber-300/15 text-amber-300'
                  }`}
                >
                  not provisioned
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setActiveSlug(MARGIN_SLUG)}
          className={`ml-auto rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
            activeSlug === MARGIN_SLUG
              ? 'bg-accent text-[color:var(--accent-contrast)]'
              : 'text-text-secondary hover:bg-surface-hover'
          }`}
        >
          Margin
        </button>
      </div>

      {activeSlug === MARGIN_SLUG ? <AdminMarginView clientId={clientId} /> : null}

      {activeSlug !== MARGIN_SLUG ? (
        <>
      {!hasRow ? (
        <section className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-5 text-sm text-amber-300">
          No balance row exists for this type yet. Save an allowance below to provision it; the
          first monthly cron run will then grant the allowance.
        </section>
      ) : null}

      {/* Allowance + rollover */}
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Monthly allowance</h2>
        <p className="mt-1 text-[12px] text-text-muted">
          Allowance is granted on the next reset after the period ends. Setting allowance does
          not immediately credit the account.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">
              Allowance
            </span>
            <input
              type="number"
              min={0}
              max={10000}
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              disabled={busy === 'allowance'}
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">
              Rollover policy
            </span>
            <select
              value={rolloverPolicy}
              onChange={(e) => setRolloverPolicy(e.target.value as RolloverPolicy)}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              disabled={busy === 'allowance'}
            >
              <option value="none">{POLICY_LABEL.none}</option>
              <option value="cap">{POLICY_LABEL.cap}</option>
              <option value="unlimited">{POLICY_LABEL.unlimited}</option>
            </select>
          </label>
          <label className={`block ${rolloverPolicy === 'cap' ? '' : 'opacity-50'}`}>
            <span className="text-[11px] uppercase tracking-wider text-text-muted">
              Rollover cap
            </span>
            <input
              type="number"
              min={0}
              max={100000}
              value={rolloverCap}
              onChange={(e) => setRolloverCap(e.target.value)}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              disabled={busy === 'allowance' || rolloverPolicy !== 'cap'}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={submitAllowance}
            disabled={busy === 'allowance' || isPending}
          >
            {busy === 'allowance' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCcw size={14} />
            )}
            Save allowance
          </Button>
        </div>
      </section>

      {/* Manual grant */}
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Manual grant</h2>
        <p className="mt-1 text-[12px] text-text-muted">
          One-off grant or correction against this type. Stripe add-ons land here automatically
          via the webhook. Negative deltas are allowed for `adjust` (corrective claw-back).
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">Kind</span>
            <select
              value={grantKind}
              onChange={(e) => setGrantKind(e.target.value as 'grant_topup' | 'adjust')}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              disabled={!hasRow || busy === 'grant'}
            >
              <option value="grant_topup">Top-up</option>
              <option value="adjust">Adjustment</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">Delta</span>
            <input
              type="number"
              step="1"
              value={grantDelta}
              placeholder="e.g. 5 or -2"
              onChange={(e) => setGrantDelta(e.target.value)}
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              disabled={!hasRow || busy === 'grant'}
            />
          </label>
          <label className="block sm:col-span-1">
            <span className="text-[11px] uppercase tracking-wider text-text-muted">Note</span>
            <input
              type="text"
              value={grantNote}
              onChange={(e) => setGrantNote(e.target.value)}
              maxLength={500}
              placeholder="Reason for this grant (audit trail)"
              className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
              disabled={!hasRow || busy === 'grant'}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={submitGrant}
            disabled={!hasRow || busy === 'grant' || isPending || !grantDelta}
          >
            {busy === 'grant' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : Number(grantDelta) < 0 ? (
              <ArrowDownCircle size={14} />
            ) : (
              <ArrowUpCircle size={14} />
            )}
            Apply grant
          </Button>
        </div>
      </section>

      {/* Pause / resume */}
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Pause monthly cron</h2>
        <p className="mt-1 text-[12px] text-text-muted">
          Pausing skips the monthly allowance grant for this type. Stripe add-ons and admin manual
          grants still work. Choose indefinite (until manually resumed) or time-bounded
          (auto-resume).
        </p>
        {paused ? (
          <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/5 p-3 text-[12px] text-amber-300">
            <p>
              <strong>Currently paused.</strong>{' '}
              {isPausedIndefinite
                ? 'Indefinite, until manually resumed.'
                : `Until ${
                    active?.pausedUntil
                      ? new Date(active.pausedUntil).toLocaleString('en-US')
                      : ''
                  }.`}
            </p>
            {active?.pauseReason ? <p className="mt-1">Reason: {active.pauseReason}</p> : null}
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={submitResume}
                disabled={busy === 'resume' || isPending}
              >
                {busy === 'resume' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <PlayCircle size={14} />
                )}
                Resume monthly grant
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-[11px] uppercase tracking-wider text-text-muted">Reason</span>
              <input
                type="text"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                maxLength={500}
                placeholder="e.g. churned, free tier, billing dispute"
                className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                disabled={busy === 'pause'}
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-text-muted">
                Resume at (optional)
              </span>
              <input
                type="datetime-local"
                value={pauseUntil}
                onChange={(e) => setPauseUntil(e.target.value)}
                className="mt-1 w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                disabled={busy === 'pause'}
              />
            </label>
            <div className="flex items-end justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => submitPause(true)}
                disabled={busy === 'pause' || isPending || !pauseUntil || !pauseReason.trim()}
              >
                {busy === 'pause' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <PauseCircle size={14} />
                )}
                Pause until date
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => submitPause(false)}
                disabled={busy === 'pause' || isPending || !pauseReason.trim()}
              >
                {busy === 'pause' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <PauseCircle size={14} />
                )}
                Pause indefinitely
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Per-type ledger */}
      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Recent ledger</h2>
        <p className="mt-1 text-[12px] text-text-muted">
          Last {tabTx.length} transactions for{' '}
          {active ? deliverableCopy(active.deliverableTypeSlug).plural : 'this type'}. Append-only
          audit log.
        </p>
        {tabTx.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No transactions yet for this type.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="py-2 font-medium">When</th>
                  <th className="py-2 font-medium">Kind</th>
                  <th className="py-2 font-medium text-right">Δ</th>
                  <th className="py-2 font-medium">Charge unit</th>
                  <th className="py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tabTx.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2 font-mono text-[11px] text-text-secondary">
                      {new Date(tx.created_at).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2 text-text-primary">{KIND_LABEL[tx.kind] ?? tx.kind}</td>
                    <td
                      className={`py-2 text-right font-mono ${
                        tx.delta >= 0 ? 'text-emerald-300' : 'text-coral-300'
                      }`}
                    >
                      {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                    </td>
                    <td className="py-2 font-mono text-[11px] text-text-secondary">
                      {tx.charge_unit_kind
                        ? `${tx.charge_unit_kind}:${tx.charge_unit_id?.slice(0, 8) ?? ''}`
                        : ''}
                    </td>
                    <td className="py-2 text-[11px] text-text-muted">{tx.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
        </>
      ) : null}
    </>
  );
}
