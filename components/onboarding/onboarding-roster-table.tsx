'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Loader2, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';
import { formatRelativeTime } from '@/lib/utils/format';

type TrackerRow = {
  id: string;
  client_id: string | null;
  service: string;
  title: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  is_template: boolean;
  template_name: string | null;
  created_at: string;
  share_token?: string;
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

export type TrackerStats = Record<string, { phases: number; groups: number; items: number }>;

type ClientOption = {
  id: string;
  name: string;
  slug: string;
  services: string[];
};

const STATUS_VARIANTS: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'default' }> = {
  active:    { label: 'Active',    variant: 'info' },
  paused:    { label: 'Paused',    variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  archived:  { label: 'Archived',  variant: 'default' },
};

/**
 * Roster table for /admin/onboarding. Shows every tracker with a quick
 * client + service + status scan, with inline "New tracker" creation
 * (pick client + service from dropdowns) and deep links to the editor.
 */
export function OnboardingRosterTable({
  trackers,
  clients,
  view = 'trackers',
  stats = {},
}: {
  trackers: TrackerRow[];
  clients: ClientOption[];
  view?: 'trackers' | 'templates';
  stats?: TrackerStats;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Archived trackers are hidden from the roster by default — status is
  // a terminal signal and a cluttered list is worse than a focused one.
  const [includeArchived, setIncludeArchived] = useState(false);

  const isTemplatesView = view === 'templates';
  const archivedCount = useMemo(
    () => (isTemplatesView ? 0 : trackers.filter((t) => t.status === 'archived').length),
    [trackers, isTemplatesView],
  );

  // Row-level duplicate: same shape as the tracker it came from.
  async function handleDuplicate(trackerId: string) {
    setBusyId(trackerId);
    try {
      const res = await fetch(`/api/onboarding/trackers/${trackerId}/duplicate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to duplicate');
        return;
      }
      toast.success('Duplicated');
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(trackerId: string, label: string) {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setBusyId(trackerId);
    try {
      const res = await fetch(`/api/onboarding/trackers/${trackerId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to delete');
        return;
      }
      toast.success('Deleted');
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = isTemplatesView || includeArchived
      ? trackers
      : trackers.filter((t) => t.status !== 'archived');
    if (!q) return base;
    return base.filter((t) => {
      const cname = t.clients?.name?.toLowerCase() ?? '';
      const tname = (t.template_name ?? '').toLowerCase();
      return (
        cname.includes(q) ||
        tname.includes(q) ||
        t.service.toLowerCase().includes(q) ||
        (t.title ?? '').toLowerCase().includes(q)
      );
    });
  }, [trackers, query, includeArchived, isTemplatesView]);

  async function handleCreate(clientId: string, service: string) {
    if (!clientId || !service) return;
    setCreating(true);
    try {
      const res = await fetch('/api/onboarding/trackers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, service }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to create tracker');
        return;
      }
      const { tracker } = await res.json() as { tracker: { id: string } };
      toast.success('Tracker created');
      router.push(`/admin/onboarding/tracker/${tracker.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateTemplate(name: string, service: string) {
    if (!name.trim() || !service) return;
    setCreating(true);
    try {
      const res = await fetch('/api/onboarding/trackers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_template: true, template_name: name.trim(), service }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to create template');
        return;
      }
      const { tracker } = await res.json() as { tracker: { id: string } };
      toast.success('Template created');
      router.push(`/admin/onboarding/tracker/${tracker.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isTemplatesView ? 'Search templates...' : 'Search trackers...'}
            className="w-full rounded-lg border border-nativz-border bg-surface-primary pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border transition-colors"
          />
        </div>
        {!isTemplatesView && archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setIncludeArchived((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              includeArchived
                ? 'border-accent-border bg-accent-surface text-accent-text'
                : 'border-nativz-border bg-surface-primary text-text-muted hover:text-text-primary'
            }`}
            title={`${archivedCount} archived`}
          >
            {includeArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
          </button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowNew((v) => !v)}
        >
          <Plus size={14} />
          {showNew ? 'Close' : isTemplatesView ? 'New template' : 'New tracker'}
        </Button>
      </div>

      {showNew && (
        isTemplatesView ? (
          <NewTemplateForm creating={creating} onCreate={handleCreateTemplate} />
        ) : (
          <NewTrackerForm clients={clients} creating={creating} onCreate={handleCreate} />
        )
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-[10px] border border-dashed border-nativz-border/60">
          <Search size={28} className="text-text-muted/60 mb-3" />
          <p className="text-sm text-text-secondary">
            {trackers.length === 0
              ? isTemplatesView
                ? 'No templates yet.'
                : 'Ready to kick off your first client onboarding?'
              : 'No results.'}
          </p>
          {trackers.length === 0 && (
            <p className="text-xs text-text-muted mt-1 max-w-sm">
              {isTemplatesView
                ? 'Save a reusable preset so every new client inherits your best playbook.'
                : 'Click "New tracker" to pick a client + service \u2014 apply a template to skip the setup.'}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nativz-border bg-surface-hover/30">
                  <Th>{isTemplatesView ? 'Template' : 'Client'}</Th>
                  <Th>Service</Th>
                  {!isTemplatesView && <Th>Status</Th>}
                  {!isTemplatesView && <Th>Started</Th>}
                  <Th>Updated</Th>
                  <Th className="text-right pr-4">{''}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const status = STATUS_VARIANTS[t.status] ?? STATUS_VARIANTS.active;
                  const s = stats[t.id];
                  const rowLabel = isTemplatesView
                    ? (t.template_name ?? 'Untitled template')
                    : (t.clients?.name ?? 'Unknown');
                  return (
                    <tr
                      key={t.id}
                      onClick={() => router.push(`/admin/onboarding/tracker/${t.id}`)}
                      className="border-b border-nativz-border last:border-b-0 hover:bg-surface-hover/20 cursor-pointer transition-colors"
                    >
                      <Td>
                        {isTemplatesView ? (
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-text-primary truncate">
                              {t.template_name ?? 'Untitled template'}
                            </p>
                            {s && (s.phases > 0 || s.groups > 0 || s.items > 0) && (
                              <p className="text-[12px] text-text-muted truncate mt-0.5">
                                <StatsLine phases={s.phases} groups={s.groups} items={s.items} />
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <ClientLogo
                              src={t.clients?.logo_url ?? null}
                              name={t.clients?.name ?? ''}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-[14px] font-medium text-text-primary truncate">
                                {t.clients?.name ?? 'Unknown'}
                              </p>
                              {t.title ? (
                                <p className="text-[12px] text-text-muted truncate">{t.title}</p>
                              ) : s && (s.phases > 0 || s.items > 0) ? (
                                <p className="text-[12px] text-text-muted truncate">
                                  <StatsLine phases={s.phases} groups={s.groups} items={s.items} />
                                </p>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </Td>
                      <Td>
                        <Badge variant="default">{t.service}</Badge>
                      </Td>
                      {!isTemplatesView && (
                        <Td>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </Td>
                      )}
                      {!isTemplatesView && (
                        <Td>
                          <span className="text-[12px] text-text-muted tabular-nums">
                            {t.started_at ? formatRelativeTime(t.started_at) : '—'}
                          </span>
                        </Td>
                      )}
                      <Td>
                        <span className="text-[12px] text-text-muted tabular-nums">
                          {formatRelativeTime(t.created_at)}
                        </span>
                      </Td>
                      <Td className="text-right pr-2">
                        <RowActionsMenu
                          busy={busyId === t.id}
                          onDuplicate={() => void handleDuplicate(t.id)}
                          onDelete={() => void handleDelete(t.id, rowLabel)}
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New tracker inline form ─────────────────────────────────────────────

function NewTrackerForm({
  clients,
  creating,
  onCreate,
}: {
  clients: ClientOption[];
  creating: boolean;
  onCreate: (clientId: string, service: string) => Promise<void>;
}) {
  const [clientId, setClientId] = useState('');
  const [service, setService] = useState('');

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  );
  // Offer the client's contracted services first; fall back to canonical 4.
  const serviceOptions = useMemo(() => {
    const canonical = ['SMM', 'Paid Media', 'Editing', 'Affiliates'];
    const contracted = selectedClient?.services ?? [];
    const merged = Array.from(new Set([...contracted, ...canonical]));
    return merged;
  }, [selectedClient]);

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">New onboarding tracker</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Client
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer"
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Service
          </label>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            disabled={!clientId}
            className="w-full rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer disabled:opacity-50"
          >
            <option value="">Select a service…</option>
            {serviceOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => void onCreate(clientId, service)}
          disabled={!clientId || !service || creating}
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Create
        </Button>
      </div>
    </div>
  );
}

// ─── New template inline form ────────────────────────────────────────

function NewTemplateForm({
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: (name: string, service: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [service, setService] = useState('');
  const canonical = ['SMM', 'Paid Media', 'Editing', 'Affiliates'];

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">New onboarding template</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Template name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Social standard launch"
            className="w-full rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Service
          </label>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer"
          >
            <option value="">Select a service…</option>
            {canonical.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => void onCreate(name, service)}
          disabled={!name.trim() || !service || creating}
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Create
        </Button>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className ?? ''}`}>{children}</td>;
}

// ─── Stats line (preview) ────────────────────────────────────────────────

function StatsLine({ phases, groups, items }: { phases: number; groups: number; items: number }) {
  const parts: string[] = [];
  if (phases > 0) parts.push(`${phases} ${phases === 1 ? 'phase' : 'phases'}`);
  if (groups > 0) parts.push(`${groups} ${groups === 1 ? 'section' : 'sections'}`);
  if (items > 0) parts.push(`${items} ${items === 1 ? 'task' : 'tasks'}`);
  return <>{parts.join(' · ')}</>;
}

// ─── Row actions (… menu) ────────────────────────────────────────────────
//
// Stops click propagation so the menu trigger doesn't also fire the row's
// navigate-to-editor click. The menu is absolutely positioned right-aligned
// below the button; outside-click + Escape close it.

function RowActionsMenu({
  busy,
  onDuplicate,
  onDelete,
}: {
  busy: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
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
    <div
      ref={rootRef}
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-60"
        aria-label="Row actions"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-lg border border-nativz-border bg-surface shadow-xl animate-[popIn_150ms_ease-out] py-1">
          <button
            type="button"
            onClick={() => { setOpen(false); onDuplicate(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors text-left"
          >
            <Copy size={13} />
            Duplicate
          </button>
          <div className="my-1 h-px bg-nativz-border/60" />
          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
