'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Lock, Check, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { centsToDollars, dollarsToCents } from '@/lib/accounting/periods';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging' | 'override' | 'misc';

interface TeamMember { id: string; full_name: string | null; role: string | null }
interface Client { id: string; name: string }

interface Entry {
  id: string;
  entry_type: EntryType;
  team_member_id: string | null;
  payee_label: string | null;
  client_id: string | null;
  video_count: number;
  rate_cents: number;
  amount_cents: number;
  margin_cents: number;
  description: string | null;
  created_at: string;
}

interface PeriodDetailClientProps {
  period: {
    id: string;
    start_date: string;
    end_date: string;
    half: 'first-half' | 'second-half';
    status: 'draft' | 'locked' | 'paid';
    notes: string | null;
    locked_at: string | null;
    paid_at: string | null;
    label: string;
  };
  initialEntries: Entry[];
  teamMembers: TeamMember[];
  clients: Client[];
}

const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  editing: 'Editing',
  smm: 'Social media management',
  affiliate: 'Affiliate',
  blogging: 'Blogging',
  override: 'Jack override',
  misc: 'Misc',
};

export function PeriodDetailClient({
  period,
  initialEntries,
  teamMembers,
  clients,
}: PeriodDetailClientProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const readonly = period.status !== 'draft';

  const totalsByType = useMemo(() => {
    const out: Record<EntryType, { amount: number; margin: number; videos: number; count: number }> = {
      editing: { amount: 0, margin: 0, videos: 0, count: 0 },
      smm: { amount: 0, margin: 0, videos: 0, count: 0 },
      affiliate: { amount: 0, margin: 0, videos: 0, count: 0 },
      blogging: { amount: 0, margin: 0, videos: 0, count: 0 },
      override: { amount: 0, margin: 0, videos: 0, count: 0 },
      misc: { amount: 0, margin: 0, videos: 0, count: 0 },
    };
    for (const e of entries) {
      const bucket = out[e.entry_type];
      bucket.amount += e.amount_cents ?? 0;
      bucket.margin += e.margin_cents ?? 0;
      bucket.videos += e.video_count ?? 0;
      bucket.count += 1;
    }
    return out;
  }, [entries]);

  const grandTotal = useMemo(
    () => entries.reduce((sum, e) => sum + (e.amount_cents ?? 0), 0),
    [entries],
  );
  const totalMargin = useMemo(
    () => entries.reduce((sum, e) => sum + (e.margin_cents ?? 0), 0),
    [entries],
  );

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    const res = await fetch(`/api/accounting/entries/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to delete');
      router.refresh();
    }
  }

  async function handleStatus(status: 'locked' | 'paid' | 'draft') {
    const res = await fetch(`/api/accounting/periods/${period.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error('Failed to update status');
      return;
    }
    toast.success(`Period ${status}`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{period.label}</h1>
          <p className="text-sm text-text-muted mt-1">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
            <span className="text-text-primary tabular-nums">{centsToDollars(grandTotal)}</span> payouts ·{' '}
            <span className="text-text-secondary tabular-nums">{centsToDollars(totalMargin)}</span> margin
          </p>
        </div>
        <div className="flex gap-2">
          {period.status === 'draft' && (
            <Button variant="outline" size="sm" onClick={() => handleStatus('locked')} disabled={isPending}>
              <Lock size={14} /> Lock
            </Button>
          )}
          {period.status === 'locked' && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleStatus('draft')} disabled={isPending}>
                Unlock
              </Button>
              <Button size="sm" onClick={() => handleStatus('paid')} disabled={isPending}>
                <Check size={14} /> Mark paid
              </Button>
            </>
          )}
          {period.status === 'paid' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
              <Check size={12} /> Paid
            </span>
          )}
        </div>
      </div>

      {/* Type breakdown chips */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {(Object.keys(ENTRY_TYPE_LABELS) as EntryType[]).map((t) => {
          const row = totalsByType[t];
          return (
            <div key={t} className="rounded-lg border border-nativz-border bg-surface px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">{ENTRY_TYPE_LABELS[t]}</p>
              <p className="text-sm font-semibold text-text-primary tabular-nums">
                {centsToDollars(row.amount)}
              </p>
              <p className="text-[10px] text-text-muted">
                {row.count} {row.count === 1 ? 'entry' : 'entries'}
                {row.videos > 0 && ` · ${row.videos} videos`}
              </p>
            </div>
          );
        })}
      </div>

      {/* Entries */}
      <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-background/50 text-text-muted">
            <tr>
              <th className="text-left font-medium px-3 py-2">Type</th>
              <th className="text-left font-medium px-3 py-2">Payee</th>
              <th className="text-left font-medium px-3 py-2">Client</th>
              <th className="text-right font-medium px-3 py-2">Videos</th>
              <th className="text-right font-medium px-3 py-2">Rate</th>
              <th className="text-right font-medium px-3 py-2">Amount</th>
              <th className="text-right font-medium px-3 py-2">Margin</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                teamMembers={teamMembers}
                clients={clients}
                readonly={readonly}
                onDelete={() => handleDelete(e.id)}
              />
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add entry */}
      {!readonly && (
        adding ? (
          <AddEntryForm
            periodId={period.id}
            teamMembers={teamMembers}
            clients={clients}
            onCreated={(e) => {
              setEntries((prev) => [...prev, e]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add entry
          </Button>
        )
      )}
    </div>
  );
}

function EntryRow({
  entry,
  teamMembers,
  clients,
  readonly,
  onDelete,
}: {
  entry: Entry;
  teamMembers: TeamMember[];
  clients: Client[];
  readonly: boolean;
  onDelete: () => void;
}) {
  const payee =
    entry.team_member_id
      ? teamMembers.find((t) => t.id === entry.team_member_id)?.full_name ?? '—'
      : entry.payee_label ?? '—';
  const client = entry.client_id ? clients.find((c) => c.id === entry.client_id)?.name ?? '—' : '—';

  return (
    <tr className="border-t border-nativz-border">
      <td className="px-3 py-2 text-text-secondary">{ENTRY_TYPE_LABELS[entry.entry_type]}</td>
      <td className="px-3 py-2 text-text-primary">{payee}</td>
      <td className="px-3 py-2 text-text-secondary">{client}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{entry.video_count || '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
        {entry.rate_cents ? centsToDollars(entry.rate_cents) : '—'}
      </td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-text-primary">
        {centsToDollars(entry.amount_cents)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
        {entry.margin_cents ? centsToDollars(entry.margin_cents) : '—'}
      </td>
      <td className="px-3 py-2">
        {!readonly && (
          <button
            onClick={onDelete}
            className="text-text-muted hover:text-red-400 cursor-pointer"
            title="Delete entry"
          >
            <Trash2 size={12} />
          </button>
        )}
      </td>
    </tr>
  );
}

function AddEntryForm({
  periodId,
  teamMembers,
  clients,
  onCreated,
  onCancel,
}: {
  periodId: string;
  teamMembers: TeamMember[];
  clients: Client[];
  onCreated: (entry: Entry) => void;
  onCancel: () => void;
}) {
  const [entryType, setEntryType] = useState<EntryType>('editing');
  const [teamMemberId, setTeamMemberId] = useState<string>('');
  const [payeeLabel, setPayeeLabel] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [videoCount, setVideoCount] = useState('');
  const [rateDollars, setRateDollars] = useState('');
  const [amountDollars, setAmountDollars] = useState('');
  const [marginDollars, setMarginDollars] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Convenience: editing rows autofill amount from rate × videos when the user
  // hasn't typed a custom amount.
  const computedAmount = useMemo(() => {
    const r = parseFloat(rateDollars);
    const v = parseInt(videoCount, 10);
    if (Number.isFinite(r) && Number.isFinite(v) && v > 0) {
      return (r * v).toFixed(2);
    }
    return '';
  }, [rateDollars, videoCount]);

  const effectiveAmount = amountDollars || computedAmount;

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch('/api/accounting/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: periodId,
          entry_type: entryType,
          team_member_id: teamMemberId || null,
          payee_label: payeeLabel.trim() || null,
          client_id: clientId || null,
          video_count: videoCount ? parseInt(videoCount, 10) : 0,
          rate_cents: rateDollars ? dollarsToCents(rateDollars) : 0,
          amount_cents: effectiveAmount ? dollarsToCents(effectiveAmount) : 0,
          margin_cents: marginDollars ? dollarsToCents(marginDollars) : 0,
          description: description.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to create entry');
        return;
      }
      onCreated(data.entry);
    } catch {
      toast.error('Failed to create entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <LabeledField label="Type">
          <select
            value={entryType}
            onChange={(e) => setEntryType(e.target.value as EntryType)}
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          >
            {(Object.keys(ENTRY_TYPE_LABELS) as EntryType[]).map((t) => (
              <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </LabeledField>

        <LabeledField label="Team member">
          <select
            value={teamMemberId}
            onChange={(e) => setTeamMemberId(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="">— none —</option>
            {teamMembers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name ?? 'unnamed'}{t.role ? ` (${t.role})` : ''}
              </option>
            ))}
          </select>
        </LabeledField>

        <LabeledField label="Or payee label">
          <input
            type="text"
            value={payeeLabel}
            onChange={(e) => setPayeeLabel(e.target.value)}
            placeholder="Affiliate name, freelancer…"
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </LabeledField>

        <LabeledField label="Client">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="">— none —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </LabeledField>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <LabeledField label="Videos">
          <input
            type="number"
            min="0"
            value={videoCount}
            onChange={(e) => setVideoCount(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </LabeledField>
        <LabeledField label="Rate ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={rateDollars}
            onChange={(e) => setRateDollars(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </LabeledField>
        <LabeledField label="Amount ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={effectiveAmount}
            onChange={(e) => setAmountDollars(e.target.value)}
            placeholder={computedAmount || '0.00'}
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </LabeledField>
        <LabeledField label="Margin ($)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={marginDollars}
            onChange={(e) => setMarginDollars(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </LabeledField>
      </div>

      <LabeledField label="Description">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short note about these videos"
          className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
        />
      </LabeledField>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving || !effectiveAmount}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save entry
        </Button>
      </div>
    </div>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </label>
  );
}
