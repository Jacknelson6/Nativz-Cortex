'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  Lock,
  Check,
  Save,
  Loader2,
  Download,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { centsToDollars, dollarsToCents } from '@/lib/accounting/periods';

// DB still accepts 'override' and 'misc' (schema unchanged). They're
// just not exposed as tabs in the UI per product call — every payroll
// entry today fits Editing / SMM / Affiliate / Blogging.
type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';
type TabKey = 'overview' | EntryType;

interface TeamMember { id: string; full_name: string | null; role: string | null }
interface Client { id: string; name: string }

interface Entry {
  id: string;
  // DB allows wider union for legacy rows; UI only renders the four
  // current types via entriesByService guard above.
  entry_type: EntryType | 'override' | 'misc';
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
  smm: 'SMM',
  affiliate: 'Affiliate',
  blogging: 'Blogging',
};

const SERVICE_TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'editing', label: 'Editing' },
  { key: 'smm', label: 'SMM' },
  { key: 'affiliate', label: 'Affiliate' },
  { key: 'blogging', label: 'Blogging' },
];

export function PeriodDetailClient({
  period,
  initialEntries,
  teamMembers,
  clients,
}: PeriodDetailClientProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [addOpenFor, setAddOpenFor] = useState<EntryType | null>(null);
  const [isPending, startTransition] = useTransition();

  const readonly = period.status !== 'draft';
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const memberById = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);

  const grandTotal = useMemo(
    () => entries.reduce((sum, e) => sum + (e.amount_cents ?? 0), 0),
    [entries],
  );
  const totalMargin = useMemo(
    () => entries.reduce((sum, e) => sum + (e.margin_cents ?? 0), 0),
    [entries],
  );

  const entriesByService = useMemo(() => {
    const out: Record<EntryType, Entry[]> = {
      editing: [], smm: [], affiliate: [], blogging: [],
    };
    for (const e of entries) {
      // Ignore legacy 'override' / 'misc' entries — they stay in the DB
      // but aren't surfaced in the UI.
      if (e.entry_type in out) out[e.entry_type as EntryType].push(e);
    }
    return out;
  }, [entries]);

  function payeeFor(e: Entry): string {
    if (e.team_member_id) {
      return memberById.get(e.team_member_id)?.full_name ?? 'Unnamed member';
    }
    return e.payee_label?.trim() || 'Unassigned';
  }

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
          <h1 className="text-3xl font-bold text-text-primary">{period.label}</h1>
          <p className="text-base text-text-secondary mt-2">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
            <span className="text-text-primary font-semibold tabular-nums">{centsToDollars(grandTotal)}</span> payouts ·{' '}
            <span className="text-text-primary tabular-nums">{centsToDollars(totalMargin)}</span> margin
          </p>
        </div>
        <div className="flex gap-2">
          {entries.length > 0 && (
            <a
              href={`/api/accounting/periods/${period.id}/export`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
            >
              <Download size={13} /> Export CSV
            </a>
          )}
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

      {/* Service tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-nativz-border">
        {SERVICE_TABS.map((tab) => {
          const count = tab.key === 'overview' ? entries.length : entriesByService[tab.key].length;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-base font-medium transition-colors cursor-pointer ${
                active
                  ? 'text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                  active ? 'bg-accent text-white' : 'bg-surface-hover text-text-secondary'
                }`}>
                  {count}
                </span>
              )}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' ? (
        <OverviewPane
          entries={entries}
          entriesByService={entriesByService}
          onDrillIn={setActiveTab}
        />
      ) : (
        <ServicePane
          service={activeTab}
          entries={entriesByService[activeTab]}
          teamMembers={teamMembers}
          clients={clients}
          clientById={clientById}
          memberById={memberById}
          readonly={readonly}
          addOpen={addOpenFor === activeTab}
          onOpenAdd={() => setAddOpenFor(activeTab)}
          onCloseAdd={() => setAddOpenFor(null)}
          periodId={period.id}
          onDelete={handleDelete}
          onCreated={(e) => {
            setEntries((prev) => [...prev, e]);
            setAddOpenFor(null);
          }}
          payeeFor={payeeFor}
        />
      )}
    </div>
  );
}

// ── Overview pane: service totals + drill-in ──────────────────────────────

function OverviewPane({
  entries,
  entriesByService,
  onDrillIn,
}: {
  entries: Entry[];
  entriesByService: Record<EntryType, Entry[]>;
  onDrillIn: (t: EntryType) => void;
}) {
  const services: EntryType[] = ['editing', 'smm', 'affiliate', 'blogging'];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {services.map((s) => {
        const rows = entriesByService[s];
        const total = rows.reduce((sum, e) => sum + e.amount_cents, 0);
        const videos = rows.reduce((sum, e) => sum + (e.video_count ?? 0), 0);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onDrillIn(s)}
            className="group flex items-start justify-between rounded-xl border border-nativz-border bg-surface px-5 py-4 text-left hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-text-secondary font-medium">
                {ENTRY_TYPE_LABELS[s]}
              </p>
              <p className="text-2xl font-bold text-text-primary tabular-nums mt-1">
                {centsToDollars(total)}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                {videos > 0 && ` · ${videos} videos`}
              </p>
            </div>
            <ChevronRight size={16} className="text-text-secondary group-hover:text-text-primary mt-1 shrink-0" />
          </button>
        );
      })}
      {entries.length === 0 && (
        <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-nativz-border bg-surface px-4 py-12 text-center text-base text-text-secondary">
          No entries yet. Pick a service tab above to add entries.
        </div>
      )}
    </div>
  );
}

// ── Service pane: per-person rollup with expandable entries ───────────────

function ServicePane({
  service,
  entries,
  teamMembers,
  clients,
  clientById,
  memberById,
  readonly,
  addOpen,
  onOpenAdd,
  onCloseAdd,
  periodId,
  onDelete,
  onCreated,
  payeeFor,
}: {
  service: EntryType;
  entries: Entry[];
  teamMembers: TeamMember[];
  clients: Client[];
  clientById: Map<string, Client>;
  memberById: Map<string, TeamMember>;
  readonly: boolean;
  addOpen: boolean;
  onOpenAdd: () => void;
  onCloseAdd: () => void;
  periodId: string;
  onDelete: (id: string) => void;
  onCreated: (entry: Entry) => void;
  payeeFor: (e: Entry) => string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Group entries by payee (team_member_id or payee_label). A null/empty
  // payee still gets its own bucket keyed "unassigned" so nothing gets
  // hidden.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; entries: Entry[]; total: number; videos: number }>();
    for (const e of entries) {
      const key = e.team_member_id ?? `label:${e.payee_label ?? 'unassigned'}`;
      const label = payeeFor(e);
      const g = map.get(key) ?? { key, label, entries: [], total: 0, videos: 0 };
      g.entries.push(e);
      g.total += e.amount_cents ?? 0;
      g.videos += e.video_count ?? 0;
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [entries, payeeFor]);

  function toggle(k: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {groups.length === 0 && !addOpen && (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface px-4 py-12 text-center">
          <p className="text-base text-text-secondary mb-4">
            No {ENTRY_TYPE_LABELS[service].toLowerCase()} entries yet.
          </p>
          {!readonly && (
            <Button variant="outline" onClick={onOpenAdd}>
              <Plus size={14} /> Add {ENTRY_TYPE_LABELS[service].toLowerCase()} entry
            </Button>
          )}
        </div>
      )}

      {groups.map((g) => {
        const isOpen = expanded.has(g.key);
        return (
          <div key={g.key} className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <ChevronRight
                  size={16}
                  className={`text-text-secondary transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
                <div>
                  <p className="text-base font-semibold text-text-primary">{g.label}</p>
                  <p className="text-sm text-text-secondary mt-0.5">
                    {g.entries.length} {g.entries.length === 1 ? 'entry' : 'entries'}
                    {g.videos > 0 && ` · ${g.videos} videos`}
                  </p>
                </div>
              </div>
              <p className="text-lg font-bold text-text-primary tabular-nums">
                {centsToDollars(g.total)}
              </p>
            </button>
            {isOpen && (
              <div className="border-t border-nativz-border">
                <table className="w-full text-sm">
                  <thead className="bg-background/40 text-text-muted">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Client</th>
                      <th className="text-right font-medium px-4 py-2">Videos</th>
                      <th className="text-right font-medium px-4 py-2">Rate</th>
                      <th className="text-right font-medium px-4 py-2">Amount</th>
                      <th className="text-right font-medium px-4 py-2">Margin</th>
                      <th className="text-left font-medium px-4 py-2">Description</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {g.entries.map((e) => (
                      <tr key={e.id} className="border-t border-nativz-border">
                        <td className="px-4 py-2 text-text-secondary">
                          {e.client_id ? clientById.get(e.client_id)?.name ?? '—' : '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-secondary">
                          {e.video_count || '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-secondary">
                          {e.rate_cents ? centsToDollars(e.rate_cents) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-text-primary">
                          {centsToDollars(e.amount_cents)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-text-secondary">
                          {e.margin_cents ? centsToDollars(e.margin_cents) : '—'}
                        </td>
                        <td className="px-4 py-2 text-text-muted truncate max-w-[240px]">
                          {e.description ?? ''}
                        </td>
                        <td className="px-4 py-2">
                          {!readonly && (
                            <button
                              onClick={() => onDelete(e.id)}
                              className="text-text-muted hover:text-red-400 cursor-pointer"
                              title="Delete entry"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {!readonly && (
        addOpen ? (
          <AddEntryForm
            periodId={periodId}
            teamMembers={teamMembers}
            clients={clients}
            fixedType={service}
            onCreated={onCreated}
            onCancel={onCloseAdd}
          />
        ) : groups.length > 0 ? (
          <Button variant="outline" size="sm" onClick={onOpenAdd}>
            <Plus size={14} /> Add {ENTRY_TYPE_LABELS[service].toLowerCase()} entry
          </Button>
        ) : null
      )}
    </div>
  );
}

// ── Add entry form ────────────────────────────────────────────────────────

function AddEntryForm({
  periodId,
  teamMembers,
  clients,
  fixedType,
  onCreated,
  onCancel,
}: {
  periodId: string;
  teamMembers: TeamMember[];
  clients: Client[];
  fixedType: EntryType;
  onCreated: (entry: Entry) => void;
  onCancel: () => void;
}) {
  const [teamMemberId, setTeamMemberId] = useState<string>('');
  const [payeeLabel, setPayeeLabel] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [videoCount, setVideoCount] = useState('');
  const [rateDollars, setRateDollars] = useState('');
  const [amountDollars, setAmountDollars] = useState('');
  const [marginDollars, setMarginDollars] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

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
          entry_type: fixedType,
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
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
        New {ENTRY_TYPE_LABELS[fixedType].toLowerCase()} entry
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            placeholder="Freelancer, affiliate…"
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

        <LabeledField label="Videos">
          <input
            type="number"
            min="0"
            value={videoCount}
            onChange={(e) => setVideoCount(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-background px-2 py-1.5 text-sm text-text-primary"
          />
        </LabeledField>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
