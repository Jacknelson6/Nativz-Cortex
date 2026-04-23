'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  FileStack,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  OnboardingEmailTemplatesPanel,
  type EmailTemplate,
} from '@/components/onboarding/onboarding-email-templates-panel';

// ─── Types ──────────────────────────────────────────────────────────────

type PhaseStatus = 'not_started' | 'in_progress' | 'done';
type ItemOwner = 'agency' | 'client';
type ItemStatus = 'pending' | 'done';
type TrackerStatus = 'active' | 'paused' | 'completed' | 'archived';

export type Tracker = {
  id: string;
  client_id: string | null;
  service: string;
  title: string | null;
  status: TrackerStatus;
  share_token: string;
  notify_emails: string[];
  started_at: string | null;
  completed_at: string | null;
  is_template: boolean;
  template_name: string | null;
  created_at: string;
  updated_at: string;
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

export type AvailableTemplate = {
  id: string;
  service: string;
  template_name: string | null;
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

export type UploadRow = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  uploaded_by: 'client' | 'admin';
  created_at: string;
};

export function OnboardingEditor({
  initialTracker,
  initialPhases,
  initialGroups,
  initialItems,
  emailTemplates = [],
  availableTemplates = [],
  contactFirstName = null,
  contactEmail = null,
  initialUploads = [],
}: {
  initialTracker: Tracker;
  initialPhases: Phase[];
  initialGroups: Group[];
  initialItems: Item[];
  emailTemplates?: EmailTemplate[];
  availableTemplates?: AvailableTemplate[];
  contactFirstName?: string | null;
  contactEmail?: string | null;
  initialUploads?: UploadRow[];
}) {
  const router = useRouter();
  const [tracker, setTracker] = useState<Tracker>(initialTracker);
  const [phases, setPhases] = useState<Phase[]>(initialPhases);
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [items, setItems] = useState<Item[]>(initialItems);

  // Sync if parent data refreshed (e.g. after router.refresh following
  // an apply-template POST). Shallow replace is fine — no local-only
  // diffs exist while the page is mounted.
  useEffect(() => { setTracker(initialTracker); }, [initialTracker]);
  useEffect(() => { setPhases(initialPhases); }, [initialPhases]);
  useEffect(() => { setGroups(initialGroups); }, [initialGroups]);
  useEffect(() => { setItems(initialItems); }, [initialItems]);

  // Ref map for scroll-into-view on newly-added rows. We keep one
  // element per phase+group id; the add* callbacks set the pending id,
  // this effect fires post-render and smooth-scrolls, then clears.
  const phaseRefMap = useRef<Map<string, HTMLElement>>(new Map());
  const groupRefMap = useRef<Map<string, HTMLElement>>(new Map());
  const [pendingScrollPhaseId, setPendingScrollPhaseId] = useState<string | null>(null);
  const [pendingScrollGroupId, setPendingScrollGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (pendingScrollPhaseId) {
      const el = phaseRefMap.current.get(pendingScrollPhaseId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingScrollPhaseId(null);
    }
  }, [pendingScrollPhaseId, phases]);
  useEffect(() => {
    if (pendingScrollGroupId) {
      const el = groupRefMap.current.get(pendingScrollGroupId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingScrollGroupId(null);
    }
  }, [pendingScrollGroupId, groups]);

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
    setPendingScrollPhaseId(phase.id);
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

  // Reorder phases: takes the dragged id and the id it was dropped over,
  // splices in-place, renumbers sort_order, and posts the full order.
  const reorderPhases = useCallback(async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const current = [...phases].sort((a, b) => a.sort_order - b.sort_order);
    const srcIdx = current.findIndex((p) => p.id === sourceId);
    const tgtIdx = current.findIndex((p) => p.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const [moved] = current.splice(srcIdx, 1);
    current.splice(tgtIdx, 0, moved);
    const next = current.map((p, i) => ({ ...p, sort_order: i }));
    const prev = phases;
    setPhases(next);
    try {
      const res = await fetch('/api/onboarding/phases/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracker_id: tracker.id, order: next.map((p) => p.id) }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to save new order');
      setPhases(prev);
    }
  }, [phases, tracker.id]);

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
    setPendingScrollGroupId(group.id);
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

  // Reorder items within a single group. Dragging between groups isn't
  // supported in slice 3 — keeps the UI + API simple; cross-group moves
  // are rare in practice.
  const reorderItems = useCallback(async (groupId: string, sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const inGroup = items
      .filter((it) => it.group_id === groupId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const srcIdx = inGroup.findIndex((it) => it.id === sourceId);
    const tgtIdx = inGroup.findIndex((it) => it.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const [moved] = inGroup.splice(srcIdx, 1);
    inGroup.splice(tgtIdx, 0, moved);
    const renumbered = inGroup.map((it, i) => ({ ...it, sort_order: i }));
    const prev = items;
    setItems((xs) => {
      const others = xs.filter((it) => it.group_id !== groupId);
      return [...others, ...renumbered];
    });
    try {
      const res = await fetch('/api/onboarding/items/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId, order: renumbered.map((it) => it.id) }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Failed to save new order');
      setItems(prev);
    }
  }, [items]);

  // ─── Template actions (only valid on non-template trackers) ─────────

  const applyTemplate = useCallback(async (templateId: string) => {
    try {
      const res = await fetch(`/api/onboarding/trackers/${tracker.id}/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to apply template');
        return;
      }
      toast.success('Template applied');
      router.refresh();
    } catch {
      toast.error('Failed to apply template');
    }
  }, [tracker.id, router]);

  const saveAsTemplate = useCallback(async () => {
    const name = window.prompt('Template name:');
    if (!name || !name.trim()) return;
    try {
      const res = await fetch(`/api/onboarding/trackers/${tracker.id}/save-as-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_name: name.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to save template');
        return;
      }
      toast.success(`Saved "${name.trim()}" as template`);
    } catch {
      toast.error('Failed to save template');
    }
  }, [tracker.id]);

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
          availableTemplates={availableTemplates}
          onUpdate={updateTracker}
          onApplyTemplate={applyTemplate}
          onSaveAsTemplate={saveAsTemplate}
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
            {[...phases]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((p) => (
                <PhaseRow
                  key={p.id}
                  phase={p}
                  onUpdate={(fields) => void updatePhase(p.id, fields)}
                  onDelete={() => void deletePhase(p.id)}
                  onReorder={(sourceId, targetId) => void reorderPhases(sourceId, targetId)}
                  registerRef={(el) => {
                    if (el) phaseRefMap.current.set(p.id, el);
                    else phaseRefMap.current.delete(p.id);
                  }}
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
              const groupItems = items
                .filter((it) => it.group_id === g.id)
                .sort((a, b) => a.sort_order - b.sort_order);
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
                  onReorderItem={(sourceId, targetId) => void reorderItems(g.id, sourceId, targetId)}
                  registerRef={(el) => {
                    if (el) groupRefMap.current.set(g.id, el);
                    else groupRefMap.current.delete(g.id);
                  }}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Notifications — hidden on templates. */}
      {!tracker.is_template && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Notifications</h2>
            <p className="text-[13px] text-text-muted">
              Emails sent automatically when the client ticks a task, uploads a file, or confirms a connection.
            </p>
          </div>
          <NotifyEmailsCard
            initial={tracker.notify_emails ?? []}
            onChange={(emails) => void updateTracker({ notify_emails: emails })}
          />
        </section>
      )}

      {/* Uploads — client-posted assets. Hidden on templates. */}
      {!tracker.is_template && (
        <section className="space-y-3">
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Uploads</h2>
              <p className="text-[13px] text-text-muted">
                Files the client has dropped into the public onboarding page.
              </p>
            </div>
          </div>
          <UploadsCard trackerId={tracker.id} initial={initialUploads} />
        </section>
      )}

      {/* Email templates — hidden on templates themselves (they have no
          client context to interpolate against). */}
      {!tracker.is_template && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Email templates</h2>
            <p className="text-[13px] text-text-muted">
              Pre-filled emails for this tracker — copy and paste into Gmail.
            </p>
          </div>
          <OnboardingEmailTemplatesPanel
            templates={emailTemplates}
            trackerId={tracker.id}
            defaultRecipientEmail={contactEmail}
            context={{
              clientName: tracker.clients?.name ?? 'Client',
              service: tracker.service,
              shareUrl,
              contactFirstName,
            }}
          />
        </section>
      )}
    </div>
  );
}

// ─── Notify emails card ─────────────────────────────────────────────────
// Manages the notify_emails[] list on the tracker. Each email is a chip;
// a text input below accepts new entries on Enter or blur. We only persist
// on list change (add or remove), not on every keystroke.

function NotifyEmailsCard({
  initial,
  onChange,
}: {
  initial: string[];
  onChange: (next: string[]) => void | Promise<void>;
}) {
  const [emails, setEmails] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');
  useEffect(() => { setEmails(initial); }, [initial]);

  function commit(next: string[]) {
    setEmails(next);
    onChange(next);
  }

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
    if (emails.includes(v)) { setDraft(''); return; }
    commit([...emails, v]);
    setDraft('');
  }

  function remove(target: string) {
    commit(emails.filter((e) => e !== target));
  }

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {emails.length === 0 && (
          <p className="text-[12px] text-text-muted italic">No one&rsquo;s subscribed yet. Add an email below.</p>
        )}
        {emails.map((e) => (
          <span
            key={e}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-surface/60 text-accent-text ring-1 ring-inset ring-accent/20 px-3 py-1 text-[12px]"
          >
            <span className="font-medium">{e}</span>
            <button
              type="button"
              onClick={() => remove(e)}
              className="text-text-muted hover:text-red-400 transition-colors"
              aria-label={`Remove ${e}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          onBlur={add}
          placeholder="onboarding-manager@nativz.io"
          className="flex-1 min-w-[220px] rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!draft.trim()}>
          <Plus size={12} />
          Add
        </Button>
      </div>
      <p className="text-[11px] text-text-muted">
        Notifications fire only on completions (not un-ticks). Keeps the inbox quiet.
      </p>
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
  availableTemplates,
  onUpdate,
  onApplyTemplate,
  onSaveAsTemplate,
}: {
  tracker: Tracker;
  progressPct: number;
  totalItems: number;
  doneItems: number;
  shareUrl: string;
  availableTemplates: AvailableTemplate[];
  onUpdate: (fields: Partial<Tracker> & { regenerate_share_token?: boolean }) => void | Promise<void>;
  onApplyTemplate: (templateId: string) => void | Promise<void>;
  onSaveAsTemplate: () => void | Promise<void>;
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
    // Confirm before invalidating — a rotated token 404s the old URL for
    // anyone who received it. Easy to do accidentally otherwise.
    const ok = window.confirm(
      'Rotate the share link?\n\n' +
        'Anyone who has the current URL will see a 404. You\u2019ll need to resend the new link.',
    );
    if (!ok) return;
    setRotating(true);
    try {
      await onUpdate({ regenerate_share_token: true });
      toast.success('Share link rotated');
    } finally {
      setRotating(false);
    }
  }

  // ─── Template branch — much slimmer header ─────────────────────────

  if (tracker.is_template) {
    return (
      <div className="rounded-[10px] border border-nativz-border bg-surface p-5 space-y-4">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-14 w-14 shrink-0 rounded-2xl bg-accent-surface text-accent-text flex items-center justify-center">
            <FileStack size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="purple">Template</Badge>
              <Badge variant="default">{tracker.service}</Badge>
            </div>
            <input
              defaultValue={tracker.template_name ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== (tracker.template_name ?? '')) onUpdate({ template_name: v });
              }}
              placeholder="Template name"
              className="mt-1 w-full max-w-md bg-transparent text-[22px] font-semibold text-text-primary placeholder:text-text-muted/60 focus:outline-none border-b border-transparent focus:border-accent-border/50 pb-0.5 transition-colors"
            />
            <p className="mt-2 text-[13px] text-text-muted">
              Templates don&apos;t run against a client — they seed new trackers when applied.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Regular tracker header ───────────────────────────────────────

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
        <div className="flex items-center gap-2 flex-wrap">
          <TemplateMenu
            availableTemplates={availableTemplates}
            onApply={onApplyTemplate}
            onSaveAs={onSaveAsTemplate}
          />
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

// ─── Template apply + save-as menu ──────────────────────────────────

function TemplateMenu({
  availableTemplates,
  onApply,
  onSaveAs,
}: {
  availableTemplates: AvailableTemplate[];
  onApply: (templateId: string) => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
      >
        <Bookmark size={13} />
        Templates
        <ChevronDown size={12} />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[240px] rounded-lg border border-nativz-border bg-surface shadow-xl animate-[popIn_150ms_ease-out] py-1">
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted/70">
            Apply template
          </div>
          {availableTemplates.length === 0 ? (
            <p className="px-3 pb-2 text-[12px] text-text-muted italic">
              No templates yet for this service.
            </p>
          ) : (
            availableTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setOpen(false); void onApply(t.id); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors text-left"
              >
                <Sparkles size={12} className="text-accent-text shrink-0" />
                <span className="truncate">{t.template_name ?? 'Untitled template'}</span>
              </button>
            ))
          )}
          <div className="my-1 h-px bg-nativz-border/60" />
          <button
            type="button"
            onClick={() => { setOpen(false); void onSaveAs(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors text-left"
          >
            <Plus size={12} />
            Save current as template…
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Phase row ────────────────────────────────────────────────────────────

function PhaseRow({
  phase,
  onUpdate,
  onDelete,
  onReorder,
  registerRef,
}: {
  phase: Phase;
  onUpdate: (fields: Partial<Phase>) => void | Promise<void>;
  onDelete: () => void;
  onReorder: (sourceId: string, targetId: string) => void;
  registerRef?: (el: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const statusStyle = PHASE_STATUS_LABELS[phase.status];

  return (
    <div
      ref={registerRef}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/cortex-phase-id', phase.id);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/cortex-phase-id')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!dragOver) setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('application/cortex-phase-id');
        setDragOver(false);
        if (sourceId) onReorder(sourceId, phase.id);
      }}
      className={`group relative rounded-[10px] border bg-surface p-4 space-y-2 transition-colors ${
        dragOver ? 'border-accent-border ring-2 ring-accent/20' : 'border-nativz-border'
      }`}
    >
      <div className="flex items-start gap-2 flex-wrap">
        <span
          className="mt-1 cursor-grab active:cursor-grabbing text-text-muted/60 hover:text-text-muted transition-colors"
          aria-hidden="true"
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </span>
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
  onReorderItem,
  registerRef,
}: {
  group: Group;
  items: Item[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onUpdateItem: (id: string, fields: Partial<Item>) => void;
  onDeleteItem: (id: string) => void;
  onReorderItem: (sourceId: string, targetId: string) => void;
  registerRef?: (el: HTMLDivElement | null) => void;
}) {
  const done = items.filter((it) => it.status === 'done').length;

  return (
    <div ref={registerRef} className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden">
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
              onReorder={(sourceId, targetId) => onReorderItem(sourceId, targetId)}
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
  onReorder,
}: {
  item: Item;
  onUpdate: (fields: Partial<Item>) => void;
  onDelete: () => void;
  onReorder: (sourceId: string, targetId: string) => void;
}) {
  const done = item.status === 'done';
  const [dragOver, setDragOver] = useState(false);

  // Each item's drag payload is namespaced to its group so a drag across
  // groups is a no-op (the drop target ignores it).
  const dragType = `application/cortex-item-id-${item.group_id}`;

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(dragType, item.id);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(dragType)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!dragOver) setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData(dragType);
        setDragOver(false);
        if (sourceId) onReorder(sourceId, item.id);
      }}
      className={`flex items-center gap-2 px-3 py-2 transition-colors ${
        dragOver ? 'bg-accent-surface/40' : ''
      }`}
    >
      <span
        className="cursor-grab active:cursor-grabbing text-text-muted/50 hover:text-text-muted transition-colors shrink-0"
        aria-hidden="true"
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </span>
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

// ─── Uploads card (admin view) ─────────────────────────────────────────
// Lists client-uploaded files; clicking a row fetches a short-lived signed
// download URL and opens it. Delete removes the row + the storage object.

function UploadsCard({
  trackerId,
  initial,
}: {
  trackerId: string;
  initial: UploadRow[];
}) {
  const [uploads, setUploads] = useState<UploadRow[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { setUploads(initial); }, [initial]);

  async function download(u: UploadRow) {
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/onboarding/trackers/${trackerId}/uploads/${u.id}`);
      if (!res.ok) throw new Error('Failed to get download link');
      const { url } = await res.json() as { url: string };
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(u: UploadRow) {
    if (!window.confirm(`Delete \u201C${u.filename}\u201D? This can\u2019t be undone.`)) return;
    const prev = uploads;
    setUploads((xs) => xs.filter((x) => x.id !== u.id));
    try {
      const res = await fetch(`/api/onboarding/trackers/${trackerId}/uploads/${u.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Deleted');
    } catch (err) {
      setUploads(prev);
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  if (uploads.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-nativz-border/60 py-8 text-center text-[13px] text-text-muted">
        No uploads yet. Clients drop files on the public page and they\u2019ll show here.
      </div>
    );
  }

  return (
    <ul className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden divide-y divide-nativz-border">
      {uploads.map((u) => (
        <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
          <div
            className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center ${
              u.uploaded_by === 'client'
                ? 'bg-accent-surface text-accent-text'
                : 'bg-surface-hover text-text-muted'
            }`}
          >
            <Bookmark size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-text-primary truncate">{u.filename}</p>
            <p className="text-[11px] text-text-muted">
              {u.uploaded_by === 'client' ? 'From client' : 'From admin'}
              {u.size_bytes != null ? ` \u00b7 ${formatBytes(u.size_bytes)}` : ''}
              {u.mime_type ? ` \u00b7 ${u.mime_type}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void download(u)}
            disabled={busyId === u.id}
            className="rounded-md border border-nativz-border bg-surface-primary px-2.5 py-1 text-[12px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
          >
            {busyId === u.id ? <Loader2 size={11} className="inline animate-spin" /> : 'Open'}
          </button>
          <button
            type="button"
            onClick={() => void remove(u)}
            className="rounded-md p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label={`Delete ${u.filename}`}
          >
            <Trash2 size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
