'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';

// ─── Types ──────────────────────────────────────────────────────────────

type PhaseStatus = 'not_started' | 'in_progress' | 'done';
type ItemOwner = 'agency' | 'client';
type ItemStatus = 'pending' | 'done';
type TrackerStatus = 'active' | 'paused' | 'completed' | 'archived';

export type Tracker = {
  id: string;
  client_id: string;
  service: string;
  title: string | null;
  status: TrackerStatus;
  share_token: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

export type Phase = {
  id: string;
  tracker_id: string;
  name: string;
  description: string | null;
  what_we_need: string | null;
  status: PhaseStatus;
  sort_order: number;
  actions: { label: string; url: string; variant?: 'primary' | 'secondary' }[];
  progress_percent: number | null;
};

export type Group = {
  id: string;
  tracker_id: string;
  name: string;
  sort_order: number;
};

export type Item = {
  id: string;
  group_id: string;
  task: string;
  description: string | null;
  owner: ItemOwner;
  status: ItemStatus;
  sort_order: number;
};

const PHASE_STATUS_LABELS: Record<PhaseStatus, { label: string; className: string }> = {
  not_started: { label: 'Not started', className: 'bg-surface-hover text-text-muted ring-1 ring-inset ring-nativz-border' },
  in_progress: { label: 'In progress', className: 'bg-accent-surface text-accent-text ring-1 ring-inset ring-accent/20' },
  done:        { label: 'Done',        className: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-500/25' },
};

// ─── Root editor ────────────────────────────────────────────────────────

export function OnboardingEditor({
  initialTracker,
  initialPhases,
  initialGroups,
  initialItems,
}: {
  initialTracker: Tracker;
  initialPhases: Phase[];
  initialGroups: Group[];
  initialItems: Item[];
}) {
  const [tracker, setTracker] = useState<Tracker>(initialTracker);
  const [phases, setPhases] = useState<Phase[]>(initialPhases);
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [items, setItems] = useState<Item[]>(initialItems);

  // ─── Tracker mutations ──────────────────────────────────────────────

  const updateTracker = useCallback(async (fields: Partial<Tracker> & { regenerate_share_token?: boolean }) => {
    const prev = tracker;
    // Optimistic for simple fields; share_token arrives from server.
    const optimistic = { ...tracker, ...fields };
    delete (optimistic as { regenerate_share_token?: unknown }).regenerate_share_token;
    setTracker(optimistic);
    try {
      const res = await fetch(`/api/onboarding/trackers/${tracker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Failed');
      const { tracker: next } = await res.json() as { tracker: Tracker };
      // Preserve joined clients data (PATCH response doesn't include it).
      setTracker({ ...next, clients: prev.clients });
    } catch {
      toast.error('Failed to update tracker');
      setTracker(prev);
    }
  }, [tracker]);

  // ─── Phase mutations ────────────────────────────────────────────────

  const addPhase = useCallback(async () => {
    const res = await fetch('/api/onboarding/phases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracker_id: tracker.id,
        name: 'New phase',
      }),
    });
    if (!res.ok) { toast.error('Failed to add phase'); return; }
    const { phase } = await res.json() as { phase: Phase };
    setPhases((xs) => [...xs, phase]);
  }, [tracker.id]);

  const updatePhase = useCallback(async (id: string, fields: Partial<Phase>) => {
    const prev = phases;
    setPhases((xs) => xs.map((p) => (p.id === id ? { ...p, ...fields } : p)));
    try {
      const res = await fetch(`/api/onboarding/phases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to update phase');
      setPhases(prev);
    }
  }, [phases]);

  const deletePhase = useCallback(async (id: string) => {
    const prev = phases;
    setPhases((xs) => xs.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/onboarding/phases/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to delete phase');
      setPhases(prev);
    }
  }, [phases]);

  // ─── Group mutations ────────────────────────────────────────────────

  const addGroup = useCallback(async () => {
    const res = await fetch('/api/onboarding/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracker_id: tracker.id, name: 'New section' }),
    });
    if (!res.ok) { toast.error('Failed to add section'); return; }
    const { group } = await res.json() as { group: Group };
    setGroups((gs) => [...gs, group]);
  }, [tracker.id]);

  const updateGroup = useCallback(async (id: string, fields: Partial<Group>) => {
    const prev = groups;
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...fields } : g)));
    try {
      const res = await fetch(`/api/onboarding/groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to update section');
      setGroups(prev);
    }
  }, [groups]);

  const deleteGroup = useCallback(async (id: string) => {
    const prevG = groups;
    const prevI = items;
    setGroups((gs) => gs.filter((g) => g.id !== id));
    setItems((xs) => xs.filter((it) => it.group_id !== id));
    try {
      const res = await fetch(`/api/onboarding/groups/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to delete section');
      setGroups(prevG);
      setItems(prevI);
    }
  }, [groups, items]);

  // ─── Item mutations ─────────────────────────────────────────────────

  const addItem = useCallback(async (groupId: string) => {
    const res = await fetch('/api/onboarding/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: groupId, task: 'New task' }),
    });
    if (!res.ok) { toast.error('Failed to add task'); return; }
    const { item } = await res.json() as { item: Item };
    setItems((xs) => [...xs, item]);
  }, []);

  const updateItem = useCallback(async (id: string, fields: Partial<Item>) => {
    const prev = items;
    setItems((xs) => xs.map((it) => (it.id === id ? { ...it, ...fields } : it)));
    try {
      const res = await fetch(`/api/onboarding/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to update task');
      setItems(prev);
    }
  }, [items]);

  const deleteItem = useCallback(async (id: string) => {
    const prev = items;
    setItems((xs) => xs.filter((it) => it.id !== id));
    try {
      const res = await fetch(`/api/onboarding/items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to delete task');
      setItems(prev);
    }
  }, [items]);

  // ─── Derived ────────────────────────────────────────────────────────

  const totalItems = items.length;
  const doneItems = items.filter((it) => it.status === 'done').length;
  const progressPct = totalItems === 0 ? 0 : Math.round((doneItems / totalItems) * 100);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const slug = tracker.clients?.slug ?? 'onboarding';
    return `${window.location.origin}/onboarding/${slug}?token=${tracker.share_token}`;
  }, [tracker.clients, tracker.share_token]);

  return (
    <div className="cortex-page-gutter space-y-6">
      <div>
        <Link
          href="/admin/onboarding"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={13} />
          All onboarding
        </Link>

        <TrackerHeader
          tracker={tracker}
          progressPct={progressPct}
          totalItems={totalItems}
          doneItems={doneItems}
          shareUrl={shareUrl}
          onUpdate={updateTracker}
        />
      </div>

      {/* Timeline */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Timeline</h2>
            <p className="text-[13px] text-text-muted">Phases your client sees on the public page, top-down.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void addPhase()}>
            <Plus size={14} />
            Add phase
          </Button>
        </div>
        {phases.length === 0 ? (
          <EmptyBlock label="No phases yet." />
        ) : (
          <div className="space-y-2">
            {phases.map((p) => (
              <PhaseRow
                key={p.id}
                phase={p}
                onUpdate={(fields) => void updatePhase(p.id, fields)}
                onDelete={() => void deletePhase(p.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Checklist */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Checklist</h2>
            <p className="text-[13px] text-text-muted">Grouped tasks with owner + status. Also renders on the public page.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void addGroup()}>
            <Plus size={14} />
            Add section
          </Button>
        </div>
        {groups.length === 0 ? (
          <EmptyBlock label="No checklist sections yet." />
        ) : (
          <div className="space-y-4">
            {groups.map((g) => {
              const groupItems = items.filter((it) => it.group_id === g.id);
              return (
                <GroupBlock
                  key={g.id}
                  group={g}
                  items={groupItems}
                  onRename={(name) => void updateGroup(g.id, { name })}
                  onDelete={() => void deleteGroup(g.id)}
                  onAddItem={() => void addItem(g.id)}
                  onUpdateItem={(id, fields) => void updateItem(id, fields)}
                  onDeleteItem={(id) => void deleteItem(id)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Tracker header (status + share link + progress) ──────────────────────

function TrackerHeader({
  tracker,
  progressPct,
  totalItems,
  doneItems,
  shareUrl,
  onUpdate,
}: {
  tracker: Tracker;
  progressPct: number;
  totalItems: number;
  doneItems: number;
  shareUrl: string;
  onUpdate: (fields: Partial<Tracker> & { regenerate_share_token?: boolean }) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  }

  async function rotateToken() {
    setRotating(true);
    try {
      await onUpdate({ regenerate_share_token: true });
      toast.success('Share link rotated');
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface p-5 space-y-4">
      <div className="flex items-start gap-4 flex-wrap">
        <ClientLogo
          src={tracker.clients?.logo_url ?? null}
          name={tracker.clients?.name ?? tracker.service}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="ui-page-title">{tracker.clients?.name ?? 'Client'}</h1>
            <Badge variant="default">{tracker.service}</Badge>
          </div>
          <input
            defaultValue={tracker.title ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (tracker.title ?? '')) onUpdate({ title: v || null });
            }}
            placeholder="Optional title (e.g. Q1 Social rollout)"
            className="mt-1 w-full max-w-md bg-transparent text-[14px] text-text-secondary placeholder:text-text-muted focus:outline-none border-b border-transparent focus:border-accent-border/50 pb-0.5 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tracker.status}
            onChange={(e) => onUpdate({ status: e.target.value as TrackerStatus })}
            className="rounded-lg border border-nativz-border bg-surface-primary px-3 py-1.5 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Progress bar (from checklist completion) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-text-muted">Checklist progress</span>
          <span className="text-text-secondary tabular-nums">{doneItems} / {totalItems} · {progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
          <div
            className="h-full bg-accent-text transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Share link */}
      <div className="rounded-lg border border-nativz-border/70 bg-surface-hover/30 p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
          Public share link
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-[280px] bg-transparent text-[12px] font-mono text-text-secondary truncate focus:outline-none"
          />
          <Button type="button" variant="outline" size="sm" onClick={copyShareUrl}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-nativz-border bg-surface-primary px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <ExternalLink size={13} />
            Open
          </a>
          <Button type="button" variant="ghost" size="sm" onClick={rotateToken} disabled={rotating}>
            {rotating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Rotate
          </Button>
        </div>
        <p className="text-[11px] text-text-muted">
          Anyone with this link can view the timeline. Rotate to revoke the old URL.
        </p>
      </div>
    </div>
  );
}

// ─── Phase row ────────────────────────────────────────────────────────────

function PhaseRow({
  phase,
  onUpdate,
  onDelete,
}: {
  phase: Phase;
  onUpdate: (fields: Partial<Phase>) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusStyle = PHASE_STATUS_LABELS[phase.status];

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface p-4 space-y-2">
      <div className="flex items-start gap-3 flex-wrap">
        <input
          defaultValue={phase.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== phase.name) onUpdate({ name: v });
          }}
          placeholder="Phase name"
          className="flex-1 min-w-[240px] bg-transparent text-[15px] font-semibold text-text-primary placeholder:text-text-muted focus:outline-none border-b border-transparent focus:border-accent-border/50 pb-0.5 transition-colors"
        />
        <select
          value={phase.status}
          onChange={(e) => onUpdate({ status: e.target.value as PhaseStatus })}
          className={`rounded-full px-3 py-0.5 text-[11px] font-medium cursor-pointer ${statusStyle.className} border-0 focus:outline-none focus:ring-1 focus:ring-accent-border`}
        >
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[12px] text-text-muted hover:text-text-primary transition-colors"
        >
          {expanded ? 'Collapse' : 'Details'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Delete phase"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="pt-2 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Description
            </label>
            <textarea
              defaultValue={phase.description ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (phase.description ?? '')) onUpdate({ description: v || null });
              }}
              placeholder="What happens in this phase"
              rows={2}
              className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              What we need from them
            </label>
            <textarea
              defaultValue={phase.what_we_need ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (phase.what_we_need ?? '')) onUpdate({ what_we_need: v || null });
              }}
              placeholder="e.g. Grant access to GA4, GSC, and your CMS"
              rows={2}
              className="block w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <PhaseActionsEditor
            actions={phase.actions}
            onChange={(actions) => onUpdate({ actions })}
          />
        </div>
      )}
    </div>
  );
}

function PhaseActionsEditor({
  actions,
  onChange,
}: {
  actions: Phase['actions'];
  onChange: (next: Phase['actions']) => void;
}) {
  const [labelDraft, setLabelDraft] = useState('');
  const [urlDraft, setUrlDraft] = useState('');

  function add() {
    const l = labelDraft.trim();
    const u = urlDraft.trim();
    if (!l || !u) return;
    onChange([...actions, { label: l, url: u, variant: 'primary' }]);
    setLabelDraft('');
    setUrlDraft('');
  }

  function remove(i: number) {
    onChange(actions.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
        Action buttons
      </label>
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {actions.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-accent-surface/60 text-accent-text ring-1 ring-inset ring-accent/20 px-2.5 py-0.5 text-[12px]"
            >
              <span className="font-medium">{a.label}</span>
              <span className="text-text-muted/70 font-mono text-[10px] max-w-[140px] truncate">{a.url}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-text-muted hover:text-red-400"
                aria-label={`Remove ${a.label}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          placeholder="Button label (e.g. Schedule call)"
          className="flex-1 min-w-[180px] rounded-lg border border-nativz-border bg-surface px-2.5 py-1.5 text-[13px] placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="https://…"
          className="flex-1 min-w-[220px] rounded-lg border border-nativz-border bg-surface px-2.5 py-1.5 text-[13px] placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!labelDraft.trim() || !urlDraft.trim()}>
          <Plus size={12} />
          Add
        </Button>
      </div>
    </div>
  );
}

// ─── Group block (checklist) ──────────────────────────────────────────────

function GroupBlock({
  group,
  items,
  onRename,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: {
  group: Group;
  items: Item[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onUpdateItem: (id: string, fields: Partial<Item>) => void;
  onDeleteItem: (id: string) => void;
}) {
  const done = items.filter((it) => it.status === 'done').length;

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-nativz-border bg-surface-hover/30">
        <input
          defaultValue={group.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== group.name) onRename(v);
          }}
          className="flex-1 bg-transparent text-[14px] font-semibold text-text-primary focus:outline-none border-b border-transparent focus:border-accent-border/50 pb-0.5 transition-colors"
        />
        <span className="text-[11px] text-text-muted tabular-nums">{done} / {items.length}</span>
        <button
          type="button"
          onClick={onAddItem}
          className="inline-flex items-center gap-1 rounded-md border border-nativz-border bg-surface-primary px-2 py-1 text-[12px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        >
          <Plus size={12} />
          Task
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label="Delete section"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[13px] text-text-muted italic">
          No tasks yet. Add one above.
        </div>
      ) : (
        <ul className="divide-y divide-nativz-border">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              onUpdate={(fields) => onUpdateItem(it.id, fields)}
              onDelete={() => onDeleteItem(it.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: Item;
  onUpdate: (fields: Partial<Item>) => void;
  onDelete: () => void;
}) {
  const done = item.status === 'done';
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <button
        type="button"
        onClick={() => onUpdate({ status: done ? 'pending' : 'done' })}
        className={`h-4 w-4 rounded-full border-2 shrink-0 transition-colors ${
          done
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-nativz-border hover:border-accent-border'
        }`}
        aria-label={done ? 'Mark pending' : 'Mark done'}
      >
        {done && <Check size={10} className="text-white mx-auto" strokeWidth={3} />}
      </button>
      <input
        defaultValue={item.task}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== item.task) onUpdate({ task: v });
        }}
        className={`flex-1 bg-transparent text-[14px] focus:outline-none ${done ? 'line-through text-text-muted' : 'text-text-primary'}`}
      />
      <select
        value={item.owner}
        onChange={(e) => onUpdate({ owner: e.target.value as ItemOwner })}
        className="text-[11px] rounded-full bg-surface-hover text-text-muted ring-1 ring-inset ring-nativz-border px-2.5 py-0.5 cursor-pointer focus:outline-none focus:ring-accent-border"
      >
        <option value="agency">Agency</option>
        <option value="client">Client</option>
      </select>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-md p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
        aria-label="Delete task"
      >
        <Trash2 size={13} />
      </button>
    </li>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-nativz-border/60 py-10 text-center text-[13px] text-text-muted">
      {label}
    </div>
  );
}
