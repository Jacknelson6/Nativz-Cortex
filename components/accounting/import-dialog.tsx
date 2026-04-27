'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Check, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { centsToDollars } from '@/lib/accounting/periods';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';

interface ProposedEntry {
  entry_type: EntryType;
  team_member_id: string | null;
  payee_label: string | null;
  client_id: string | null;
  client_name_raw: string | null;
  video_count: number;
  rate_cents: number;
  amount_cents: number;
  description: string | null;
}

interface TeamMember { id: string; full_name: string | null }
interface Client { id: string; name: string }

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  periodId: string;
  periodLabel: string;
  teamMembers: TeamMember[];
  clients: Client[];
  onImported: () => void;
}

type Stage = 'paste' | 'preview' | 'submitting';

// Only editing is priced per unit — amount auto-computes from rate ×
// video_count and locks. SMM, affiliate, and blogging are flat payouts;
// Amount is the only numeric field that matters for those.
function hasPerUnitPricing(type: EntryType): boolean {
  return type === 'editing';
}

/**
 * Two-stage modal for bulk-importing payroll entries from pasted text.
 *
 *   Stage 1 (paste):   textarea + default service + "Parse" button
 *   Stage 2 (preview): table of proposed rows the admin can edit or remove,
 *                      with "Confirm & import N entries" at the bottom
 *
 * The parse stage hits /api/accounting/import which asks Claude to
 * structure the text; nothing is saved until the admin confirms. If a
 * proposed row has no resolved team_member_id or client_id, inline
 * dropdowns let the user pick one before confirming.
 */
export function ImportDialog({
  open,
  onClose,
  periodId,
  periodLabel,
  teamMembers,
  clients,
  onImported,
}: ImportDialogProps) {
  const [stage, setStage] = useState<Stage>('paste');
  const [text, setText] = useState('');
  const [defaultType, setDefaultType] = useState<EntryType>('editing');
  const [parsing, setParsing] = useState(false);
  const [proposals, setProposals] = useState<ProposedEntry[]>([]);

  useEffect(() => {
    if (!open) {
      // Reset on close so the next invocation is a clean slate.
      setStage('paste');
      setText('');
      setProposals([]);
      setParsing(false);
    }
  }, [open]);

  const memberOptions = useMemo(
    () => teamMembers.filter((m) => m.full_name).map((m) => ({ id: m.id, label: m.full_name! })),
    [teamMembers],
  );
  const clientOptions = useMemo(
    () => clients.map((c) => ({ id: c.id, label: c.name })),
    [clients],
  );

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const res = await fetch('/api/accounting/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: periodId,
          text: text.trim(),
          default_entry_type: defaultType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Parse failed');
        return;
      }
      if (!data.proposals || data.proposals.length === 0) {
        toast.error('No entries detected in that text.');
        return;
      }
      setProposals(data.proposals);
      setStage('preview');
    } catch {
      toast.error('Parse failed — try again.');
    } finally {
      setParsing(false);
    }
  }

  function updateRow(idx: number, patch: Partial<ProposedEntry>) {
    setProposals((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        const next = { ...p, ...patch };
        // Editing + blogging compute amount from videos × rate so the
        // admin can't accidentally type a mismatched total.
        if (hasPerUnitPricing(next.entry_type)) {
          next.amount_cents = next.video_count * next.rate_cents;
        }
        return next;
      }),
    );
  }

  function removeRow(idx: number) {
    setProposals((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleConfirm() {
    setStage('submitting');
    try {
      const res = await fetch('/api/accounting/entries/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: periodId,
          entries: proposals.map((p) => ({
            entry_type: p.entry_type,
            team_member_id: p.team_member_id,
            payee_label: p.team_member_id ? null : p.payee_label,
            client_id: p.client_id,
            video_count: p.video_count,
            rate_cents: p.rate_cents,
            amount_cents: p.amount_cents,
            description: p.description,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Import failed');
        setStage('preview');
        return;
      }
      toast.success(`Imported ${proposals.length} entries`);
      onImported();
      onClose();
    } catch {
      toast.error('Import failed');
      setStage('preview');
    }
  }

  const grandTotal = proposals.reduce((s, p) => s + (p.amount_cents ?? 0), 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title=""
      maxWidth="5xl"
      className="!max-w-4xl"
      bodyClassName="p-0 flex flex-col max-h-[85vh]"
    >
        {/* Header */}
        <div className="px-6 py-4 border-b border-nativz-border">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-accent-text" />
            <p className="text-xs uppercase tracking-wide text-text-secondary font-medium">
              Import · {periodLabel}
            </p>
          </div>
          <h2 className="text-xl font-bold text-text-primary mt-1">
            {stage === 'paste' ? 'Paste your numbers' : 'Does this look right?'}
          </h2>
          {stage === 'preview' && (
            <p className="text-sm text-text-secondary mt-1">
              {proposals.length} proposed entries · {centsToDollars(grandTotal)} total.
              Edit or remove any row below before confirming.
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {stage === 'paste' ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-text-secondary">Default service:</label>
                <select
                  value={defaultType}
                  onChange={(e) => setDefaultType(e.target.value as EntryType)}
                  className="rounded-lg border border-nativz-border bg-background px-3 py-1.5 text-sm text-text-primary"
                >
                  <option value="editing">Editing</option>
                  <option value="smm">SMM</option>
                  <option value="affiliate">Affiliate</option>
                  <option value="blogging">Blogging</option>
                </select>
                <span className="text-xs text-text-secondary">
                  Applied when the text doesn't specify a service per row.
                </span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Paste anything — a Google Sheet selection, a Slack message, freeform notes.

Example:
Khori — 12 edits for Toastique @ $35 = $420
Jashan — 8 Videolab videos, $35 each = $280
Affiliate payout: Cole @ Rockpower, $1200
`}
                rows={14}
                className="w-full rounded-lg border border-nativz-border bg-background px-4 py-3 text-base text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              />
            </div>
          ) : (
            <div className="p-4">
              <table className="w-full text-sm table-fixed">
                {/* Fixed column widths so header cells line up exactly with
                    the input cells underneath. Units/Rate get modest widths;
                    the free-text columns take the remaining space. */}
                <colgroup>
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead className="text-text-secondary">
                  <tr className="border-b border-nativz-border">
                    <th className="text-left font-semibold px-3 py-2">Service</th>
                    <th className="text-left font-semibold px-3 py-2">Payee</th>
                    <th className="text-left font-semibold px-3 py-2">Client</th>
                    <th className="text-left font-semibold px-3 py-2">Videos</th>
                    <th className="text-left font-semibold px-3 py-2">Rate</th>
                    <th className="text-left font-semibold px-3 py-2">Amount</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p, i) => {
                    const unresolvedPayee = !p.team_member_id && !p.payee_label;
                    const needsClient = !p.client_id && p.client_name_raw;
                    const perUnit = hasPerUnitPricing(p.entry_type);
                    return (
                      <tr key={i} className="border-b border-nativz-border align-top">
                        <td className="px-3 py-2">
                          <select
                            value={p.entry_type}
                            onChange={(e) => updateRow(i, { entry_type: e.target.value as EntryType })}
                            className="w-full rounded border border-nativz-border bg-background px-2 py-1 text-sm text-text-primary"
                          >
                            <option value="editing">Editing</option>
                            <option value="smm">SMM</option>
                            <option value="affiliate">Affiliate</option>
                            <option value="blogging">Blogging</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={p.team_member_id ?? ''}
                            onChange={(e) =>
                              updateRow(i, {
                                team_member_id: e.target.value || null,
                                payee_label: e.target.value ? null : p.payee_label,
                              })
                            }
                            className={`w-full rounded border bg-background px-2 py-1 text-sm ${
                              unresolvedPayee
                                ? 'border-amber-500/50 text-amber-400'
                                : 'border-nativz-border text-text-primary'
                            }`}
                          >
                            <option value="">{p.payee_label ?? '— pick a team member —'}</option>
                            {memberOptions.map((m) => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>
                          {unresolvedPayee && (
                            <p className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
                              <AlertCircle size={10} /> Unmatched — pick a team member or leave as label
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={p.client_id ?? ''}
                            onChange={(e) => updateRow(i, { client_id: e.target.value || null })}
                            className={`w-full rounded border bg-background px-2 py-1 text-sm ${
                              needsClient
                                ? 'border-amber-500/50 text-amber-400'
                                : 'border-nativz-border text-text-primary'
                            }`}
                          >
                            <option value="">
                              {p.client_name_raw ? `"${p.client_name_raw}" (unmatched)` : '— none —'}
                            </option>
                            {clientOptions.map((c) => (
                              <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {perUnit ? (
                            <input
                              type="number"
                              min="0"
                              aria-label="Videos"
                              value={p.video_count}
                              onChange={(e) => updateRow(i, { video_count: parseInt(e.target.value, 10) || 0 })}
                              className="w-full rounded border border-nativz-border bg-background px-2 py-1 text-sm tabular-nums text-text-primary"
                            />
                          ) : (
                            <span className="text-text-secondary text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {perUnit ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              aria-label="Rate"
                              value={(p.rate_cents / 100).toFixed(2)}
                              onChange={(e) =>
                                updateRow(i, { rate_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                              }
                              className="w-full rounded border border-nativz-border bg-background px-2 py-1 text-sm tabular-nums text-text-primary"
                            />
                          ) : (
                            <span className="text-text-secondary text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label="Amount"
                            readOnly={perUnit}
                            disabled={perUnit}
                            value={(p.amount_cents / 100).toFixed(2)}
                            onChange={(e) =>
                              updateRow(i, { amount_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                            }
                            className={`w-full rounded border bg-background px-2 py-1 text-sm tabular-nums font-semibold ${
                              perUnit
                                ? 'border-nativz-border text-text-secondary cursor-not-allowed'
                                : 'border-nativz-border text-text-primary'
                            }`}
                            title={perUnit ? 'Auto-computed from units × rate' : undefined}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeRow(i)}
                            className="text-text-secondary hover:text-red-400 cursor-pointer"
                            title="Remove row"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {proposals.length === 0 && (
                <div className="px-4 py-10 text-center text-base text-text-secondary">
                  All rows removed. <button onClick={() => setStage('paste')} className="text-accent-text underline">Paste again</button>.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-nativz-border px-6 py-4 flex items-center justify-between gap-3 bg-background/30">
          {stage === 'paste' ? (
            <>
              <p className="text-xs text-text-secondary">
                The AI parses the text locally — you review every row before it gets saved.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button onClick={handleParse} disabled={parsing || !text.trim()}>
                  {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Parse
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStage('paste')}>
                ← Back to paste
              </Button>
              <div className="flex items-center gap-3">
                <p className="text-base text-text-primary">
                  <span className="text-text-secondary">Total: </span>
                  <span className="font-bold tabular-nums">{centsToDollars(grandTotal)}</span>
                </p>
                <Button
                  onClick={handleConfirm}
                  disabled={stage === 'submitting' || proposals.length === 0}
                >
                  {stage === 'submitting' ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Confirm &amp; import {proposals.length} {proposals.length === 1 ? 'entry' : 'entries'}
                </Button>
              </div>
            </>
          )}
        </div>
    </Dialog>
  );
}
