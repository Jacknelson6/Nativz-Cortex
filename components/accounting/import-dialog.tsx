'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Loader2,
  Check,
  Trash2,
  AlertCircle,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { centsToDollars } from '@/lib/accounting/periods';
import { isLikelyWiseUrl } from '@/lib/accounting/wise';

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
  // When the dialog is opened from a per-editor sub-tab in
  // PeriodDetailClient, pre-select that editor so unmatched rows fall
  // back to them instead of becoming amber "pick a payee" warnings.
  defaultTeamMemberId?: string | null;
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
  defaultTeamMemberId = null,
}: ImportDialogProps) {
  const [stage, setStage] = useState<Stage>('paste');
  const [text, setText] = useState('');
  const [defaultType, setDefaultType] = useState<EntryType>('editing');
  const [defaultMember, setDefaultMember] = useState<string>('');
  const [wiseUrl, setWiseUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [proposals, setProposals] = useState<ProposedEntry[]>([]);

  useEffect(() => {
    if (!open) {
      // Reset on close so the next invocation is a clean slate.
      setStage('paste');
      setText('');
      setProposals([]);
      setParsing(false);
      setWiseUrl('');
      setDefaultMember('');
    } else {
      // Re-seed the editor pre-selection every time the dialog opens so
      // bouncing between per-editor sub-tabs without a hard reset still
      // picks the right default.
      setDefaultMember(defaultTeamMemberId ?? '');
    }
  }, [open, defaultTeamMemberId]);

  const wiseUrlTrimmed = wiseUrl.trim();
  const wiseUrlValid =
    wiseUrlTrimmed === '' || /^https?:\/\/\S+$/i.test(wiseUrlTrimmed);
  const wiseUrlLooksWise = wiseUrlTrimmed === '' || isLikelyWiseUrl(wiseUrlTrimmed);

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
    if (!wiseUrlValid) {
      toast.error('Wise link needs to start with http:// or https://');
      return;
    }
    setParsing(true);
    try {
      const res = await fetch('/api/accounting/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: periodId,
          text: text.trim(),
          default_entry_type: defaultType,
          default_team_member_id: defaultMember || undefined,
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
    if (!wiseUrlValid) {
      toast.error('Wise link needs to start with http:// or https://');
      return;
    }
    setStage('submitting');
    try {
      const res = await fetch('/api/accounting/entries/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: periodId,
          wise_url: wiseUrlTrimmed || undefined,
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
              Edit or remove any row below before confirming. Amber fields are
              ones the parser couldn&apos;t fill in.
            </p>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {stage === 'paste' ? (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide text-text-secondary font-medium">
                    Default service
                  </label>
                  <select
                    value={defaultType}
                    onChange={(e) => setDefaultType(e.target.value as EntryType)}
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="editing">Editing</option>
                    <option value="smm">SMM</option>
                    <option value="affiliate">Affiliate</option>
                    <option value="blogging">Blogging</option>
                  </select>
                  <p className="text-[11px] text-text-secondary">
                    Applied when the text doesn&apos;t specify a service per row.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide text-text-secondary font-medium">
                    Default editor
                  </label>
                  <select
                    value={defaultMember}
                    onChange={(e) => setDefaultMember(e.target.value)}
                    className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="">— none, parse names from the text —</option>
                    {memberOptions.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-text-secondary">
                    Pick when every row is for the same editor (Wise drop, single-editor batch).
                  </p>
                </div>
              </div>
              <WiseUrlField
                value={wiseUrl}
                onChange={setWiseUrl}
                valid={wiseUrlValid}
                looksWise={wiseUrlLooksWise}
              />
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Paste anything: freeform text, a Notion table, a Wise CSV row. We'll figure it out.`}
                rows={14}
                className="w-full rounded-lg border border-nativz-border bg-background px-4 py-3 text-base text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              />
              <PasteHints />
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {wiseUrlTrimmed && (
                <div className="flex items-center gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-xs text-text-secondary">
                  <LinkIcon size={12} className="text-accent-text shrink-0" />
                  <span className="truncate">
                    Wise link <span className="text-text-primary font-mono">{wiseUrlTrimmed}</span> will be attached to every entry below.
                  </span>
                </div>
              )}
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
                    // For per-unit rows the parser should have surfaced
                    // a video count and a rate; if either landed at 0
                    // the amount will too. Highlight so the importer
                    // catches a parse miss before commit.
                    const needsVideos = perUnit && p.video_count === 0;
                    const needsRate = perUnit && p.rate_cents === 0;
                    const needsAmount = !perUnit && p.amount_cents === 0;
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
                              className={`w-full rounded border bg-background px-2 py-1 text-sm tabular-nums ${
                                needsVideos
                                  ? 'border-amber-500/60 text-amber-400'
                                  : 'border-nativz-border text-text-primary'
                              }`}
                              title={needsVideos ? 'Parser missed this column' : undefined}
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
                              className={`w-full rounded border bg-background px-2 py-1 text-sm tabular-nums ${
                                needsRate
                                  ? 'border-amber-500/60 text-amber-400'
                                  : 'border-nativz-border text-text-primary'
                              }`}
                              title={needsRate ? 'Parser missed this column' : undefined}
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
                                : needsAmount
                                  ? 'border-amber-500/60 text-amber-400'
                                  : 'border-nativz-border text-text-primary'
                            }`}
                            title={
                              perUnit
                                ? 'Auto-computed from units × rate'
                                : needsAmount
                                  ? 'Parser missed this column'
                                  : undefined
                            }
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

        {/* Hint examples handled inline above; footer below. */}
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

function WiseUrlField({
  value,
  onChange,
  valid,
  looksWise,
}: {
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  looksWise: boolean;
}) {
  const trimmed = value.trim();
  const showInvalid = trimmed !== '' && !valid;
  const showWiseHint = trimmed !== '' && valid && !looksWise;

  return (
    <div className="rounded-xl border border-nativz-border bg-surface px-4 py-3 space-y-1.5">
      <label
        htmlFor="import-wise-url"
        className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-text-secondary font-medium"
      >
        <LinkIcon size={12} className="text-text-secondary" />
        Wise payment link <span className="text-text-secondary normal-case lowercase">(optional)</span>
      </label>
      <input
        id="import-wise-url"
        type="url"
        inputMode="url"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://wise.com/pay/..."
        className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 ${
          showInvalid
            ? 'border-red-400/60 focus:border-red-400 focus:ring-red-400'
            : 'border-nativz-border focus:border-accent focus:ring-accent'
        }`}
      />
      {showInvalid ? (
        <p className="text-xs text-red-400">
          Needs to start with http:// or https://
        </p>
      ) : showWiseHint ? (
        <p className="text-xs text-text-secondary">
          Doesn&apos;t look like a Wise link. We&apos;ll save it anyway, but double-check the URL.
        </p>
      ) : (
        <p className="text-[11px] text-text-secondary">
          Stamped onto every imported entry so the period grid&apos;s payout link is ready.
        </p>
      )}
    </div>
  );
}

function PasteHints() {
  return (
    <div className="rounded-lg border border-nativz-border bg-background/40 p-4 text-xs text-text-secondary space-y-3">
      <p className="font-semibold text-text-primary uppercase tracking-wide text-[11px]">
        Works with anything. A few examples:
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <HintBlock
          title="Freeform"
          sample={`Khori: 12 edits for Toastique @ $35\nJashan: 8 Videolab videos @ $35\nCole affiliate Rockpower $1200`}
        />
        <HintBlock
          title="Notion table"
          sample={`Editor\tClient\tVideos\tRate\tTotal\nJed\tToastique\t12\t35\t420\nKen\tVideolab\t8\t35\t280`}
        />
        <HintBlock
          title="Wise CSV row"
          sample={`Date,Recipient,Amount,Currency\n2026-04-15,Jed Smith,420.00,USD\n2026-04-15,Ken Lee,280.00,USD`}
        />
      </div>
    </div>
  );
}

function HintBlock({ title, sample }: { title: string; sample: string }) {
  return (
    <div className="rounded border border-nativz-border bg-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide font-semibold text-text-primary mb-1.5">
        {title}
      </p>
      <pre className="text-[11px] leading-snug whitespace-pre-wrap break-words font-mono text-text-secondary">
        {sample}
      </pre>
    </div>
  );
}
