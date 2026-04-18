'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Loader2, Check, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { centsToDollars } from '@/lib/accounting/periods';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';

interface ProposedEntry {
  entry_type: EntryType;
  client_id: string | null;
  client_name_raw: string | null;
  video_count: number;
  rate_cents: number;
  amount_cents: number;
  description: string | null;
}

interface SubmitPayrollClientProps {
  token: string;
  periodLabel: string;
  memberName: string;
  defaultType: EntryType;
  clients: Array<{ id: string; name: string }>;
  previousSubmissionCount: number;
}

type Stage = 'paste' | 'preview' | 'submitting' | 'done';

/**
 * Public submission page for a team member. No login required — the URL
 * token is the credential. Same paste-parse-confirm UX as the admin
 * importer, but with payee locked to the token's team member and margin
 * always zero (margin is an admin concern).
 */
export function SubmitPayrollClient({
  token,
  periodLabel,
  memberName,
  defaultType,
  clients,
  previousSubmissionCount,
}: SubmitPayrollClientProps) {
  const [stage, setStage] = useState<Stage>('paste');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [proposals, setProposals] = useState<ProposedEntry[]>([]);
  const [created, setCreated] = useState(0);
  const [createdTotal, setCreatedTotal] = useState(0);

  const grandTotal = useMemo(
    () => proposals.reduce((s, p) => s + (p.amount_cents ?? 0), 0),
    [proposals],
  );

  async function handleParse() {
    if (!text.trim()) return;
    setParsing(true);
    try {
      const res = await fetch(`/api/submit-payroll/${token}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Parse failed');
        return;
      }
      if (!data.proposals || data.proposals.length === 0) {
        toast.error("Nothing detected. Try rewriting or adding dollar amounts.");
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
    setProposals((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function removeRow(idx: number) {
    setProposals((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleConfirm() {
    setStage('submitting');
    try {
      const res = await fetch(`/api/submit-payroll/${token}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: proposals.map((p) => ({
            entry_type: p.entry_type,
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
        toast.error(data.error ?? 'Submit failed');
        setStage('preview');
        return;
      }
      setCreated(data.created ?? 0);
      setCreatedTotal(data.total_cents ?? 0);
      setStage('done');
    } catch {
      toast.error('Submit failed');
      setStage('preview');
    }
  }

  if (stage === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-md text-center space-y-4">
          <CheckCircle2 size={48} className="text-emerald-400 mx-auto" />
          <h1 className="text-3xl font-bold text-text-primary">Submitted</h1>
          <p className="text-base text-text-secondary">
            {created} {created === 1 ? 'entry' : 'entries'} logged for {periodLabel} —{' '}
            <span className="text-text-primary font-semibold">{centsToDollars(createdTotal)}</span>.
          </p>
          <p className="text-sm text-text-secondary">
            Jack will review and lock the period before payout.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setStage('paste');
              setProposals([]);
              setText('');
            }}
          >
            Submit more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        {/* Header */}
        <div>
          <p className="text-xs uppercase tracking-wide text-text-secondary font-medium">
            Payroll submission · {periodLabel}
          </p>
          <h1 className="text-3xl font-bold text-text-primary mt-2">
            Hey {memberName}, log your work.
          </h1>
          <p className="text-base text-text-secondary mt-2">
            Paste a list of what you did this period — any format works. We'll parse it, show you
            what we got, and you confirm before it goes through.
          </p>
          {previousSubmissionCount > 0 && (
            <p className="text-sm text-text-secondary mt-2">
              You've submitted {previousSubmissionCount}{' '}
              {previousSubmissionCount === 1 ? 'time' : 'times'} before for this period — new
              entries get appended.
            </p>
          )}
        </div>

        {stage === 'paste' ? (
          <div className="space-y-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Paste or type anything. Example:

Toastique: 12 videos @ $35
Videolab: 8 videos @ $35
Rockpower: 3 revisions, $25 each
`}
              rows={16}
              className="w-full rounded-xl border border-nativz-border bg-surface px-4 py-3 text-base text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent font-mono"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-secondary">
                Default service: <span className="text-text-primary font-medium capitalize">{defaultType}</span>.
                The AI will guess per-row based on what you paste.
              </p>
              <Button onClick={handleParse} disabled={parsing || !text.trim()}>
                {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Parse my numbers
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary">Does this look right?</h2>
              <Button variant="ghost" onClick={() => setStage('paste')}>
                ← Edit my paste
              </Button>
            </div>
            <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-text-secondary bg-background/50">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Service</th>
                    <th className="text-left font-semibold px-3 py-2">Client</th>
                    <th className="text-right font-semibold px-3 py-2">Videos</th>
                    <th className="text-right font-semibold px-3 py-2">Rate</th>
                    <th className="text-right font-semibold px-3 py-2">Amount</th>
                    <th className="text-left font-semibold px-3 py-2">Notes</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p, i) => (
                    <tr key={i} className="border-t border-nativz-border align-top">
                      <td className="px-3 py-2">
                        <select
                          value={p.entry_type}
                          onChange={(e) => updateRow(i, { entry_type: e.target.value as EntryType })}
                          className="rounded border border-nativz-border bg-background px-2 py-1 text-sm text-text-primary"
                        >
                          <option value="editing">Editing</option>
                          <option value="smm">SMM</option>
                          <option value="affiliate">Affiliate</option>
                          <option value="blogging">Blogging</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 min-w-[160px]">
                        <select
                          value={p.client_id ?? ''}
                          onChange={(e) => updateRow(i, { client_id: e.target.value || null })}
                          className="w-full rounded border border-nativz-border bg-background px-2 py-1 text-sm text-text-primary"
                        >
                          <option value="">
                            {p.client_name_raw ? `"${p.client_name_raw}" (unmatched)` : '— pick client —'}
                          </option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          value={p.video_count}
                          onChange={(e) => updateRow(i, { video_count: parseInt(e.target.value, 10) || 0 })}
                          className="w-16 rounded border border-nativz-border bg-background px-2 py-1 text-sm text-right tabular-nums text-text-primary"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={(p.rate_cents / 100).toFixed(2)}
                          onChange={(e) =>
                            updateRow(i, { rate_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                          }
                          className="w-20 rounded border border-nativz-border bg-background px-2 py-1 text-sm text-right tabular-nums text-text-primary"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={(p.amount_cents / 100).toFixed(2)}
                          onChange={(e) =>
                            updateRow(i, { amount_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                          }
                          className="w-24 rounded border border-nativz-border bg-background px-2 py-1 text-sm text-right tabular-nums font-semibold text-text-primary"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={p.description ?? ''}
                          onChange={(e) => updateRow(i, { description: e.target.value || null })}
                          placeholder="Notes"
                          className="w-full rounded border border-nativz-border bg-background px-2 py-1 text-sm text-text-primary"
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
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-nativz-border bg-surface px-5 py-3">
              <p className="text-base text-text-secondary">
                <span className="text-text-primary font-medium">{proposals.length}</span>{' '}
                {proposals.length === 1 ? 'entry' : 'entries'} · total{' '}
                <span className="text-text-primary font-bold tabular-nums">{centsToDollars(grandTotal)}</span>
              </p>
              <Button
                onClick={handleConfirm}
                disabled={stage === 'submitting' || proposals.length === 0}
              >
                {stage === 'submitting' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Looks right — submit
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
