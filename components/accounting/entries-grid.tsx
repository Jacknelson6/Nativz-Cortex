'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Sparkles, Check, Loader2, AlertCircle, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { dollarsToCents } from '@/lib/accounting/periods';
import { getPreset } from '@/lib/accounting/presets';
import { extractWiseUrl } from '@/lib/accounting/wise';

type EntryType = 'editing' | 'smm' | 'affiliate' | 'blogging';

interface TeamMember { id: string; full_name: string | null; role: string | null }
interface Client {
  id: string;
  name: string;
  services?: string[] | null;
  editing_rate_per_video_cents?: number | null;
}

export interface GridEntry {
  id: string;
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

interface DraftRow {
  _localId: string;
  // Locked at creation so a draft committed after a tab switch can't
  // be misclassified by a stale-closure POST.
  entry_type: EntryType;
  team_member_id: string | null;
  payee_label: string | null;
  client_id: string | null;
  video_count: number;
  amount_cents: number;
  description: string | null;
  saving: boolean;
  error: string | null;
}

interface EntriesGridProps {
  service: EntryType;
  entries: GridEntry[];
  teamMembers: TeamMember[];
  clients: Client[];
  readonly: boolean;
  periodId: string;
  onLocalCreate: (entry: GridEntry) => void;
  onLocalUpdate: (entry: GridEntry) => void;
  onLocalDelete: (id: string) => void;
  // When set, new draft rows pre-stamp this payee and the draft picker
  // renders as a fixed label. Used by editor sub-tabs so adding a row
  // while filtered to "Jed" auto-targets Jed.
  lockedTeamMemberId?: string | null;
  lockedPayeeLabel?: string | null;
}

const SERVICE_LABELS: Record<EntryType, string> = {
  editing: 'Editing',
  smm: 'SMM',
  affiliate: 'Affiliate',
  blogging: 'Blogging',
};

function dollarsInputValue(cents: number): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2);
}

function parseDollarsInput(raw: string): number {
  const trimmed = raw.trim().replace(/[$,]/g, '');
  if (!trimmed) return 0;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function EntriesGrid({
  service,
  entries,
  teamMembers,
  clients,
  readonly,
  periodId,
  onLocalCreate,
  onLocalUpdate,
  onLocalDelete,
  lockedTeamMemberId = null,
  lockedPayeeLabel = null,
}: EntriesGridProps) {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [savingExisting, setSavingExisting] = useState<Set<string>>(new Set());
  const [errorExisting, setErrorExisting] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);

  const memberById = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const isEditing = service === 'editing';

  // Drop selections that point at entries that no longer exist (e.g.
  // after a delete or a tab switch repopulating the table).
  useEffect(() => {
    const valid = new Set(entries.map((e) => e.id));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [entries]);

  // Latest drafts via ref so debounced commits read fresh state instead
  // of a stale closure snapshot.
  const draftsRef = useRef<DraftRow[]>(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // One debounce timer per draft; rapid-fire field edits collapse into a
  // single POST 250ms after the user stops touching the row.
  const commitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const timers = commitTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  function newDraft(prefill?: Partial<DraftRow>): DraftRow {
    return {
      _localId: `draft-${Math.random().toString(36).slice(2, 9)}`,
      entry_type: service,
      team_member_id: prefill?.team_member_id ?? lockedTeamMemberId ?? null,
      payee_label: prefill?.payee_label ?? lockedPayeeLabel ?? null,
      client_id: prefill?.client_id ?? null,
      video_count: prefill?.video_count ?? 0,
      amount_cents: prefill?.amount_cents ?? 0,
      description: prefill?.description ?? null,
      saving: false,
      error: null,
    };
  }

  function addBlankDraft() {
    setDrafts((prev) => [...prev, newDraft()]);
  }

  function autoAddSmmClients() {
    const existingClientIds = new Set([
      ...entries.map((e) => e.client_id).filter(Boolean),
      ...drafts.map((d) => d.client_id).filter(Boolean),
    ]);
    const smmClients = clients.filter(
      (c) => Array.isArray(c.services) && c.services.includes('SMM') && !existingClientIds.has(c.id),
    );
    // Surface which clients got filtered out so it's obvious when a brand
    // is missing the SMM service tag in /admin/clients.
    if (process.env.NODE_ENV !== 'production') {
      const rejected = clients.filter(
        (c) => !existingClientIds.has(c.id) && !(Array.isArray(c.services) && c.services.includes('SMM')),
      );
      if (rejected.length > 0) {
        console.info(
          '[autoAddSmmClients] skipped (not tagged SMM):',
          rejected.map((c) => c.name).join(', '),
        );
      }
    }
    if (smmClients.length === 0) {
      toast.info('All SMM-flagged clients already have a row.');
      return;
    }
    const preset = getPreset('smm');
    setDrafts((prev) => [
      ...prev,
      ...smmClients.map((c) =>
        newDraft({ client_id: c.id, amount_cents: preset?.amount_cents ?? 0 }),
      ),
    ]);
    toast.success(`Added ${smmClients.length} SMM ${smmClients.length === 1 ? 'client' : 'clients'}.`);
  }

  function updateDraft(localId: string, patch: Partial<DraftRow>) {
    setDrafts((prev) =>
      prev.map((d) => (d._localId === localId ? { ...d, ...patch, error: null } : d)),
    );
  }

  function removeDraft(localId: string) {
    setDrafts((prev) => prev.filter((d) => d._localId !== localId));
  }

  function isDraftReadyToSave(d: DraftRow): boolean {
    const hasPayee = Boolean(d.team_member_id) || Boolean(d.payee_label?.trim());
    const hasMoney = d.amount_cents > 0 || (isEditing && d.video_count > 0);
    return hasPayee && hasMoney;
  }

  function scheduleCommit(localId: string) {
    const existing = commitTimers.current.get(localId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      commitTimers.current.delete(localId);
      void persistDraftById(localId);
    }, 250);
    commitTimers.current.set(localId, t);
  }

  async function persistDraftById(localId: string) {
    const d = draftsRef.current.find((x) => x._localId === localId);
    if (!d) return;
    if (!isDraftReadyToSave(d) || d.saving) return;

    setDrafts((prev) =>
      prev.map((x) => (x._localId === localId ? { ...x, saving: true, error: null } : x)),
    );

    // Compute margin/rate using the draft's locked entry_type, not the
    // currently-rendered tab.
    const draftIsEditing = d.entry_type === 'editing';
    const margin = draftIsEditing ? computeEditingMargin(d, clientById) : 0;
    const ratePerVideo =
      draftIsEditing && d.video_count > 0 ? Math.round(d.amount_cents / d.video_count) : 0;

    try {
      const res = await fetch('/api/accounting/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: periodId,
          entry_type: d.entry_type,
          team_member_id: d.team_member_id,
          payee_label: d.payee_label?.trim() || null,
          client_id: d.client_id,
          video_count: d.video_count,
          rate_cents: ratePerVideo,
          amount_cents: d.amount_cents,
          margin_cents: margin,
          description: d.description?.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDrafts((prev) =>
          prev.map((x) =>
            x._localId === localId
              ? { ...x, saving: false, error: data.error ?? 'Failed to save' }
              : x,
          ),
        );
        return;
      }
      onLocalCreate(data.entry);
      removeDraft(localId);
    } catch {
      setDrafts((prev) =>
        prev.map((x) =>
          x._localId === localId ? { ...x, saving: false, error: 'Network error' } : x,
        ),
      );
    }
  }

  async function patchExisting(entry: GridEntry, patch: Partial<GridEntry>) {
    setSavingExisting((s) => new Set(s).add(entry.id));
    setErrorExisting((m) => {
      const next = new Map(m);
      next.delete(entry.id);
      return next;
    });

    const merged: GridEntry = { ...entry, ...patch };
    if (isEditing) {
      merged.margin_cents = computeEditingMargin(merged, clientById);
      merged.rate_cents =
        merged.video_count > 0 ? Math.round(merged.amount_cents / merged.video_count) : 0;
    }

    const body: Record<string, unknown> = { ...patch };
    if (isEditing) {
      body.margin_cents = merged.margin_cents;
      body.rate_cents = merged.rate_cents;
    }

    onLocalUpdate(merged);

    try {
      const res = await fetch(`/api/accounting/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorExisting((m) => new Map(m).set(entry.id, data.error ?? 'Failed to save'));
        onLocalUpdate(entry);
      }
    } catch {
      setErrorExisting((m) => new Map(m).set(entry.id, 'Network error'));
      onLocalUpdate(entry);
    } finally {
      setSavingExisting((s) => {
        const next = new Set(s);
        next.delete(entry.id);
        return next;
      });
    }
  }

  async function deleteExisting(entry: GridEntry) {
    onLocalDelete(entry.id);
    setSelected((prev) => {
      if (!prev.has(entry.id)) return prev;
      const next = new Set(prev);
      next.delete(entry.id);
      return next;
    });
    const res = await fetch(`/api/accounting/entries/${entry.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Failed to delete');
      onLocalUpdate(entry);
    }
  }

  function toggleRowSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllSelected() {
    setSelected((prev) => {
      if (prev.size === entries.length && entries.length > 0) return new Set();
      return new Set(entries.map((e) => e.id));
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function applyBulk(patch: {
    team_member_id?: string | null;
    payee_label?: string | null;
    amount_cents?: number;
    description?: string | null;
  }) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const targets = entries.filter((e) => selected.has(e.id));
    if (targets.length === 0) return;

    setBulkApplying(true);
    let failures = 0;

    await Promise.all(
      targets.map(async (entry) => {
        const merged: GridEntry = { ...entry, ...patch };
        if (isEditing) {
          merged.margin_cents = computeEditingMargin(merged, clientById);
          merged.rate_cents =
            merged.video_count > 0 ? Math.round(merged.amount_cents / merged.video_count) : 0;
        }

        const body: Record<string, unknown> = { ...patch };
        if (isEditing && (patch.amount_cents !== undefined)) {
          body.margin_cents = merged.margin_cents;
          body.rate_cents = merged.rate_cents;
        }

        onLocalUpdate(merged);

        try {
          const res = await fetch(`/api/accounting/entries/${entry.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            failures += 1;
            onLocalUpdate(entry);
          }
        } catch {
          failures += 1;
          onLocalUpdate(entry);
        }
      }),
    );

    setBulkApplying(false);
    if (failures > 0) {
      toast.error(`Updated ${ids.length - failures} of ${ids.length} rows`);
    } else {
      toast.success(`Updated ${ids.length} ${ids.length === 1 ? 'row' : 'rows'}`);
      clearSelection();
    }
  }

  async function deleteBulk() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} ${ids.length === 1 ? 'row' : 'rows'}? This can't be undone.`)) {
      return;
    }
    setBulkApplying(true);

    const snapshot = entries.filter((e) => selected.has(e.id));
    for (const entry of snapshot) onLocalDelete(entry.id);
    setSelected(new Set());

    let failures = 0;
    await Promise.all(
      snapshot.map(async (entry) => {
        try {
          const res = await fetch(`/api/accounting/entries/${entry.id}`, { method: 'DELETE' });
          if (!res.ok) {
            failures += 1;
            onLocalUpdate(entry);
          }
        } catch {
          failures += 1;
          onLocalUpdate(entry);
        }
      }),
    );

    setBulkApplying(false);
    if (failures > 0) {
      toast.error(`Deleted ${snapshot.length - failures} of ${snapshot.length} rows`);
    } else {
      toast.success(`Deleted ${snapshot.length} ${snapshot.length === 1 ? 'row' : 'rows'}`);
    }
  }

  const totalEntries = entries.length + drafts.length;

  const totals = useMemo(() => {
    let amount = 0;
    let videos = 0;
    let revenue = 0;
    let margin = 0;
    for (const e of entries) {
      amount += e.amount_cents ?? 0;
      videos += e.video_count ?? 0;
      if (isEditing) {
        revenue += computeEditingRevenue(e, clientById);
        margin += computeEditingMargin(e, clientById);
      }
    }
    return { amount, videos, revenue, margin };
  }, [entries, isEditing, clientById]);

  const allSelected = entries.length > 0 && selected.size === entries.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="space-y-3">
      {!readonly && service === 'smm' && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-nativz-border bg-surface px-4 py-3">
          <p className="text-sm text-text-secondary">
            Auto-fill from clients with SMM in their service list, then tweak per-period.
          </p>
          <Button variant="outline" size="sm" onClick={autoAddSmmClients}>
            <Sparkles size={14} /> Add SMM clients
          </Button>
        </div>
      )}

      {!readonly && selected.size > 0 && (
        <BulkActionBar
          service={service}
          count={selected.size}
          teamMembers={teamMembers}
          busy={bulkApplying}
          onApply={applyBulk}
          onDelete={deleteBulk}
          onClear={clearSelection}
        />
      )}

      {totalEntries === 0 ? (
        <div className="rounded-xl border border-dashed border-nativz-border bg-surface px-4 py-12 text-center">
          <p className="text-base text-text-secondary mb-4">
            No {SERVICE_LABELS[service].toLowerCase()} entries yet.
          </p>
          {!readonly && (
            <Button variant="outline" onClick={addBlankDraft}>
              <Plus size={14} /> Add row
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-nativz-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nativz-border bg-background/40 text-left">
                {!readonly && (
                  <HeadCell className="w-10">
                    <SelectAllCheckbox
                      allSelected={allSelected}
                      indeterminate={someSelected}
                      disabled={entries.length === 0}
                      onToggle={toggleAllSelected}
                    />
                  </HeadCell>
                )}
                <HeadCell>{isEditing ? 'Editor' : payeeHeader(service)}</HeadCell>
                <HeadCell>Client</HeadCell>
                {isEditing && <HeadCell className="w-20">Videos</HeadCell>}
                <HeadCell className="w-32">{isEditing ? 'Editor cost' : 'Amount'}</HeadCell>
                {isEditing && <HeadCell className="w-32">Revenue</HeadCell>}
                {isEditing && <HeadCell className="w-32">Margin</HeadCell>}
                <HeadCell>Description</HeadCell>
                {!readonly && <HeadCell className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <ExistingRow
                  key={e.id}
                  entry={e}
                  service={service}
                  teamMembers={teamMembers}
                  clients={clients}
                  clientById={clientById}
                  memberById={memberById}
                  readonly={readonly}
                  selected={selected.has(e.id)}
                  onToggleSelected={() => toggleRowSelected(e.id)}
                  saving={savingExisting.has(e.id)}
                  error={errorExisting.get(e.id) ?? null}
                  onPatch={(patch) => patchExisting(e, patch)}
                  onDelete={() => deleteExisting(e)}
                />
              ))}
              {drafts.map((d) => (
                <DraftRowUI
                  key={d._localId}
                  draft={d}
                  service={service}
                  teamMembers={teamMembers}
                  clients={clients}
                  clientById={clientById}
                  readonly={readonly}
                  payeeLocked={
                    lockedTeamMemberId !== null || lockedPayeeLabel !== null
                  }
                  readyToSave={isDraftReadyToSave(d)}
                  onChange={(patch) => updateDraft(d._localId, patch)}
                  onCommit={() => scheduleCommit(d._localId)}
                  onRemove={() => removeDraft(d._localId)}
                />
              ))}
            </tbody>
            {entries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-nativz-border bg-background/30 font-semibold">
                  {!readonly && <td className="px-3 py-2" />}
                  <td className="px-3 py-2 text-left text-text-primary" colSpan={2}>
                    Period total
                  </td>
                  {isEditing && (
                    <td className="px-3 py-2 text-center tabular-nums text-text-primary">
                      {totals.videos || '—'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center tabular-nums text-text-primary">
                    {totals.amount ? `$${(totals.amount / 100).toFixed(2)}` : '—'}
                  </td>
                  {isEditing && (
                    <td className="px-3 py-2 text-center tabular-nums text-text-primary">
                      {totals.revenue ? `$${(totals.revenue / 100).toFixed(2)}` : '—'}
                    </td>
                  )}
                  {isEditing && (
                    <td
                      className={`px-3 py-2 text-center tabular-nums ${
                        totals.margin < 0
                          ? 'text-red-400'
                          : totals.margin > 0
                            ? 'text-emerald-400'
                            : 'text-text-muted'
                      }`}
                    >
                      {totals.margin === 0
                        ? '—'
                        : `${totals.margin < 0 ? '-' : ''}$${(Math.abs(totals.margin) / 100).toFixed(2)}`}
                    </td>
                  )}
                  <td className="px-3 py-2" />
                  {!readonly && <td className="px-3 py-2" />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!readonly && totalEntries > 0 && (
        <div className="flex justify-start">
          <Button variant="outline" size="sm" onClick={addBlankDraft}>
            <Plus size={14} /> Add row
          </Button>
        </div>
      )}
    </div>
  );
}

function payeeHeader(service: EntryType): string {
  if (service === 'smm') return 'Manager';
  if (service === 'affiliate') return 'Payee';
  if (service === 'blogging') return 'Blogger';
  return 'Editor';
}

function HeadCell({
  children,
  className,
  align = 'center',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const alignCx =
    align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  return (
    <th
      className={`px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-text-muted ${alignCx} ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function computeEditingMargin(
  row: { client_id: string | null; video_count: number; amount_cents: number },
  clientById: Map<string, Client>,
): number {
  const c = row.client_id ? clientById.get(row.client_id) : null;
  const ratePerVideo = c?.editing_rate_per_video_cents ?? 5000;
  const revenue = (row.video_count ?? 0) * ratePerVideo;
  return revenue - (row.amount_cents ?? 0);
}

function computeEditingRevenue(
  row: { client_id: string | null; video_count: number },
  clientById: Map<string, Client>,
): number {
  const c = row.client_id ? clientById.get(row.client_id) : null;
  const ratePerVideo = c?.editing_rate_per_video_cents ?? 5000;
  return (row.video_count ?? 0) * ratePerVideo;
}

// ── Row: existing entry (PATCH on blur) ───────────────────────────────────

function ExistingRow({
  entry,
  service,
  teamMembers,
  clients,
  clientById,
  memberById,
  readonly,
  selected,
  onToggleSelected,
  saving,
  error,
  onPatch,
  onDelete,
}: {
  entry: GridEntry;
  service: EntryType;
  teamMembers: TeamMember[];
  clients: Client[];
  clientById: Map<string, Client>;
  memberById: Map<string, TeamMember>;
  readonly: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  saving: boolean;
  error: string | null;
  onPatch: (patch: Partial<GridEntry>) => void;
  onDelete: () => void;
}) {
  const isEditing = service === 'editing';
  const revenue = isEditing ? computeEditingRevenue(entry, clientById) : 0;
  const margin = isEditing ? computeEditingMargin(entry, clientById) : 0;

  return (
    <tr
      className={`border-t border-nativz-border first:border-t-0 ${
        selected ? 'bg-accent/[0.06]' : ''
      }`}
    >
      {!readonly && (
        <Cell>
          <RowCheckbox checked={selected} onChange={onToggleSelected} />
        </Cell>
      )}
      <Cell>
        <PayeePicker
          teamMemberId={entry.team_member_id}
          payeeLabel={entry.payee_label}
          teamMembers={teamMembers}
          memberById={memberById}
          readonly={readonly}
          onPickMember={(id) => onPatch({ team_member_id: id, payee_label: null })}
          onTypeLabel={(label) => onPatch({ team_member_id: null, payee_label: label })}
        />
      </Cell>
      <Cell>
        <ClientPicker
          clientId={entry.client_id}
          clients={clients}
          readonly={readonly}
          onPick={(id) => onPatch({ client_id: id })}
        />
      </Cell>
      {isEditing && (
        <Cell>
          <NumberInput
            value={entry.video_count}
            readonly={readonly}
            onCommit={(v) => v !== entry.video_count && onPatch({ video_count: v })}
          />
        </Cell>
      )}
      <Cell>
        <DollarInput
          cents={entry.amount_cents}
          readonly={readonly}
          onCommit={(c) => c !== entry.amount_cents && onPatch({ amount_cents: c })}
        />
      </Cell>
      {isEditing && (
        <Cell>
          <ReadonlyDollar cents={revenue} />
        </Cell>
      )}
      {isEditing && (
        <Cell>
          <ReadonlyDollar cents={margin} dim={margin === 0} negative={margin < 0} />
        </Cell>
      )}
      <Cell>
        <DescriptionCell
          value={entry.description ?? ''}
          readonly={readonly}
          onCommit={(v) => v !== (entry.description ?? '') && onPatch({ description: v || null })}
        />
      </Cell>
      {!readonly && (
        <Cell>
          <RowStatus
            saving={saving}
            error={error}
            onDelete={onDelete}
          />
        </Cell>
      )}
    </tr>
  );
}

function DescriptionCell({
  value,
  readonly,
  onCommit,
}: {
  value: string;
  readonly: boolean;
  onCommit: (v: string) => void;
}) {
  const wiseUrl = extractWiseUrl(value);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 min-w-0">
        <TextInput
          value={value}
          placeholder="Optional"
          readonly={readonly}
          onCommit={onCommit}
        />
      </div>
      {wiseUrl && (
        <a
          href={wiseUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Wise: ${wiseUrl}`}
          aria-label="Open Wise payout link"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-nativz-border bg-background px-1.5 py-1 text-[10px] uppercase tracking-wide font-semibold text-text-secondary hover:border-accent hover:text-accent-text"
        >
          Wise <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

// ── Row: unsaved draft ────────────────────────────────────────────────────

function DraftRowUI({
  draft,
  service,
  teamMembers,
  clients,
  clientById,
  readonly,
  payeeLocked,
  readyToSave,
  onChange,
  onCommit,
  onRemove,
}: {
  draft: DraftRow;
  service: EntryType;
  teamMembers: TeamMember[];
  clients: Client[];
  clientById: Map<string, Client>;
  readonly: boolean;
  payeeLocked: boolean;
  readyToSave: boolean;
  onChange: (patch: Partial<DraftRow>) => void;
  onCommit: () => void;
  onRemove: () => void;
}) {
  const isEditing = service === 'editing';
  const revenue = isEditing ? computeEditingRevenue(draft, clientById) : 0;
  const margin = isEditing ? revenue - draft.amount_cents : 0;
  const memberById = useMemo(() => new Map(teamMembers.map((m) => [m.id, m])), [teamMembers]);

  return (
    <tr className="border-t border-nativz-border bg-accent/[0.03]">
      {!readonly && <td className="px-3 py-1.5" aria-hidden />}
      <Cell>
        <PayeePicker
          teamMemberId={draft.team_member_id}
          payeeLabel={draft.payee_label}
          teamMembers={teamMembers}
          memberById={memberById}
          readonly={payeeLocked}
          onPickMember={(id) => {
            onChange({ team_member_id: id, payee_label: null });
            if (id) onCommit();
          }}
          onTypeLabel={(label) => onChange({ team_member_id: null, payee_label: label })}
          onBlur={onCommit}
        />
      </Cell>
      <Cell>
        <ClientPicker
          clientId={draft.client_id}
          clients={clients}
          readonly={false}
          onPick={(id) => {
            const patch: Partial<DraftRow> = { client_id: id };
            // Auto-fill the preset amount on first client pick. Don't
            // clobber a user-entered value if they typed first.
            if (id && draft.amount_cents === 0) {
              const preset = getPreset(draft.entry_type);
              if (preset) patch.amount_cents = preset.amount_cents;
            }
            onChange(patch);
            onCommit();
          }}
        />
      </Cell>
      {isEditing && (
        <Cell>
          <NumberInput
            value={draft.video_count}
            readonly={false}
            onCommit={(v) => {
              onChange({ video_count: v });
              onCommit();
            }}
          />
        </Cell>
      )}
      <Cell>
        <DollarInput
          cents={draft.amount_cents}
          readonly={false}
          onCommit={(c) => {
            onChange({ amount_cents: c });
            onCommit();
          }}
        />
      </Cell>
      {isEditing && (
        <Cell>
          <ReadonlyDollar cents={revenue} />
        </Cell>
      )}
      {isEditing && (
        <Cell>
          <ReadonlyDollar cents={margin} dim={margin === 0} negative={margin < 0} />
        </Cell>
      )}
      <Cell>
        <TextInput
          value={draft.description ?? ''}
          placeholder="Optional"
          readonly={false}
          onCommit={(v) => {
            onChange({ description: v || null });
            onCommit();
          }}
        />
      </Cell>
      <Cell>
        <DraftStatus
          ready={readyToSave}
          saving={draft.saving}
          error={draft.error}
          onRemove={onRemove}
        />
      </Cell>
    </tr>
  );
}

// ── Cell shells ───────────────────────────────────────────────────────────

function Cell({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  const alignCx =
    align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  return <td className={`px-3 py-1.5 align-middle ${alignCx}`}>{children}</td>;
}

const cellInputCx =
  'block w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-text-primary placeholder-text-muted hover:border-nativz-border focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent text-center';

function PayeePicker({
  teamMemberId,
  payeeLabel,
  teamMembers,
  memberById,
  readonly,
  onPickMember,
  onTypeLabel,
  onBlur,
}: {
  teamMemberId: string | null;
  payeeLabel: string | null;
  teamMembers: TeamMember[];
  memberById: Map<string, TeamMember>;
  readonly: boolean;
  onPickMember: (id: string | null) => void;
  onTypeLabel: (label: string) => void;
  onBlur?: () => void;
}) {
  const [mode, setMode] = useState<'member' | 'label'>(
    teamMemberId ? 'member' : payeeLabel ? 'label' : 'member',
  );

  if (readonly) {
    return (
      <span className="text-text-primary">
        {teamMemberId
          ? memberById.get(teamMemberId)?.full_name ?? '—'
          : payeeLabel?.trim() || '—'}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {mode === 'member' ? (
        <select
          value={teamMemberId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__label__') {
              setMode('label');
              onPickMember(null);
              return;
            }
            onPickMember(v || null);
          }}
          onBlur={onBlur}
          className={cellInputCx + ' min-w-[8rem]'}
        >
          <option value="">— pick —</option>
          {teamMembers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name ?? 'unnamed'}
            </option>
          ))}
          <option value="__label__">+ Custom name…</option>
        </select>
      ) : (
        <>
          <input
            type="text"
            value={payeeLabel ?? ''}
            placeholder="Freelancer name"
            onChange={(e) => onTypeLabel(e.target.value)}
            onBlur={onBlur}
            className={cellInputCx + ' min-w-[8rem]'}
          />
          <button
            type="button"
            onClick={() => {
              setMode('member');
              onTypeLabel('');
            }}
            className="text-xs text-text-muted hover:text-text-secondary"
            title="Switch back to team member dropdown"
          >
            ↩
          </button>
        </>
      )}
    </div>
  );
}

function ClientPicker({
  clientId,
  clients,
  readonly,
  onPick,
}: {
  clientId: string | null;
  clients: Client[];
  readonly: boolean;
  onPick: (id: string | null) => void;
}) {
  if (readonly) {
    const c = clientId ? clients.find((x) => x.id === clientId) : null;
    return <span className="text-text-primary">{c?.name ?? '—'}</span>;
  }
  return (
    <select
      value={clientId ?? ''}
      onChange={(e) => onPick(e.target.value || null)}
      className={cellInputCx + ' min-w-[8rem]'}
    >
      <option value="">— none —</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  readonly,
  onCommit,
}: {
  value: number;
  readonly: boolean;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value || ''));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setLocal(String(value || ''));
  }

  if (readonly) {
    return <span className="tabular-nums text-text-primary">{value || 0}</span>;
  }
  return (
    <input
      type="number"
      min="0"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = parseInt(local, 10);
        const next = Number.isFinite(n) && n >= 0 ? n : 0;
        if (next !== value) onCommit(next);
      }}
      className={cellInputCx + ' tabular-nums'}
    />
  );
}

function DollarInput({
  cents,
  readonly,
  onCommit,
}: {
  cents: number;
  readonly: boolean;
  onCommit: (cents: number) => void;
}) {
  const [local, setLocal] = useState(dollarsInputValue(cents));
  const [seen, setSeen] = useState(cents);
  if (seen !== cents) {
    setSeen(cents);
    setLocal(dollarsInputValue(cents));
  }

  if (readonly) {
    return (
      <span className="tabular-nums text-text-primary">
        {cents ? `$${(cents / 100).toFixed(2)}` : '—'}
      </span>
    );
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder="$0.00"
      onBlur={() => {
        const next = parseDollarsInput(local);
        if (next !== cents) onCommit(next);
        setLocal(dollarsInputValue(next));
      }}
      className={cellInputCx + ' tabular-nums'}
    />
  );
}

function ReadonlyDollar({
  cents,
  dim,
  negative,
}: {
  cents: number;
  dim?: boolean;
  negative?: boolean;
}) {
  const cls = negative
    ? 'text-red-400'
    : dim
      ? 'text-text-muted'
      : 'text-text-primary font-medium';
  return (
    <span className={`tabular-nums ${cls}`}>
      {cents === 0 ? '—' : `${negative ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`}
    </span>
  );
}

function TextInput({
  value,
  placeholder,
  readonly,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  readonly: boolean;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setLocal(value);
  }

  if (readonly) {
    return (
      <span className="text-text-secondary text-sm">{value || '—'}</span>
    );
  }
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const trimmed = local.trim();
        if (trimmed !== value) onCommit(trimmed);
      }}
      placeholder={placeholder}
      className={cellInputCx}
    />
  );
}

function RowStatus({
  saving,
  error,
  onDelete,
}: {
  saving: boolean;
  error: string | null;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {saving ? (
        <Loader2 size={13} className="animate-spin text-text-muted" />
      ) : error ? (
        <span title={error} className="text-red-400">
          <AlertCircle size={13} />
        </span>
      ) : null}
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-red-400"
        title="Delete row"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function DraftStatus({
  ready,
  saving,
  error,
  onRemove,
}: {
  ready: boolean;
  saving: boolean;
  error: string | null;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {saving ? (
        <Loader2 size={13} className="animate-spin text-text-muted" />
      ) : error ? (
        <span title={error} className="text-red-400">
          <AlertCircle size={13} />
        </span>
      ) : ready ? (
        <Check size={13} className="text-emerald-400" />
      ) : (
        <span className="text-[10px] uppercase tracking-wide text-text-muted">draft</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-red-400"
        title="Discard draft row"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Bulk select + bulk action bar ─────────────────────────────────────────

function SelectAllCheckbox({
  allSelected,
  indeterminate,
  disabled,
  onToggle,
}: {
  allSelected: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      disabled={disabled}
      onChange={onToggle}
      aria-label={allSelected ? 'Clear selection' : 'Select all rows'}
      className="h-4 w-4 cursor-pointer accent-accent disabled:cursor-default disabled:opacity-40"
    />
  );
}

function RowCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={checked ? 'Deselect row' : 'Select row'}
      className="h-4 w-4 cursor-pointer accent-accent"
    />
  );
}

function BulkActionBar({
  service,
  count,
  teamMembers,
  busy,
  onApply,
  onDelete,
  onClear,
}: {
  service: EntryType;
  count: number;
  teamMembers: TeamMember[];
  busy: boolean;
  onApply: (patch: {
    team_member_id?: string | null;
    payee_label?: string | null;
    amount_cents?: number;
    description?: string | null;
  }) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [memberId, setMemberId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');

  const memberLabel = service === 'smm' ? 'Manager' : payeeHeader(service);
  const preset = getPreset(service);

  function applyPreset() {
    if (!preset) return;
    onApply({ amount_cents: preset.amount_cents });
  }

  function handleApply() {
    const patch: Parameters<typeof onApply>[0] = {};
    if (memberId) {
      patch.team_member_id = memberId;
      patch.payee_label = null;
    }
    const trimmedAmount = amount.trim();
    if (trimmedAmount) {
      patch.amount_cents = parseDollarsInput(trimmedAmount);
    }
    const trimmedDesc = desc.trim();
    if (trimmedDesc) {
      patch.description = trimmedDesc;
    }
    if (Object.keys(patch).length === 0) {
      toast.error('Pick at least one field to apply.');
      return;
    }
    onApply(patch);
    setMemberId('');
    setAmount('');
    setDesc('');
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/[0.08] px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2 pr-2">
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent-text tabular-nums">
          {count}
        </span>
        <span className="text-sm text-text-primary">
          {count === 1 ? 'row selected' : 'rows selected'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          disabled={busy}
          className="rounded-md border border-nativz-border bg-surface px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          title={`Set ${memberLabel.toLowerCase()} on selected rows`}
        >
          <option value="">{memberLabel}…</option>
          {teamMembers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name ?? 'unnamed'}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          disabled={busy}
          className="w-28 rounded-md border border-nativz-border bg-surface px-2 py-1 text-sm tabular-nums text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <input
          type="text"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description"
          disabled={busy}
          className="w-44 rounded-md border border-nativz-border bg-surface px-2 py-1 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button size="sm" onClick={handleApply} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Apply
        </Button>
        {preset && (
          <Button
            variant="outline"
            size="sm"
            onClick={applyPreset}
            disabled={busy}
            title={`Apply preset (${preset.label})`}
          >
            <Sparkles size={13} /> Apply {preset.label.split(' ')[0]}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onDelete} disabled={busy}>
          <Trash2 size={13} /> Delete
        </Button>
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        title="Clear selection"
        className="ml-auto rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-40"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Re-exported in case the period detail wants to inline-call this for its
// own draft state preview.
export function _internalDollarsToCents(v: string) {
  return dollarsToCents(v);
}
