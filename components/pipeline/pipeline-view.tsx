'use client';

import { useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Plus, Loader2, ChevronLeft, ChevronRight, RefreshCw,
  ExternalLink, Trash2,
  Table2, Kanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

/** Extract first valid URL from a string that may have prefixed text (e.g. "April - https://...") */
function extractUrl(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : raw;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PipelineItem {
  id: string;
  client_id: string | null;
  client_name: string;
  month_label: string;
  month_date: string;
  agency: string | null;
  strategist: string | null;
  videographer: string | null;
  editing_manager: string | null;
  editor: string | null;
  smm: string | null;
  assignment_status: string;
  raws_status: string;
  editing_status: string;
  client_approval_status: string;
  boosting_status: string;
  shoot_date: string | null;
  strategy_due_date: string | null;
  raws_due_date: string | null;
  smm_due_date: string | null;
  calendar_sent_date: string | null;
  edited_videos_folder_url: string | null;
  raws_folder_url: string | null;
  later_calendar_link: string | null;
  project_brief_url: string | null;
  notes: string | null;
}

export interface TeamMember {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

// ─── Status Configs ──────────────────────────────────────────────────────────

const ASSIGNMENT_STATUSES = [
  { value: 'can_assign', label: 'Can assign', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'assigned', label: 'Assigned', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'need_shoot', label: 'Need shoot', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
];

const RAWS_STATUSES = [
  { value: 'need_to_schedule', label: 'Need to schedule', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'waiting_on_shoot', label: 'Waiting on shoot', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'uploaded', label: 'Uploaded', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

const EDITING_STATUSES = [
  { value: 'not_started', label: 'Not started', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'editing', label: 'Editing', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'edited', label: 'Edited', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'em_approved', label: 'EM approved', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  { value: 'revising', label: 'Revising', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-emerald-700/20 text-emerald-400 border-emerald-500/30' },
  { value: 'done', label: 'Done', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

const APPROVAL_STATUSES = [
  { value: 'not_sent', label: 'Not sent', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'waiting_on_approval', label: 'Waiting on approval', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'client_approved', label: 'Client approved', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { value: 'needs_revision', label: 'Needs revision', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'revised', label: 'Revised', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'sent_to_paid_media', label: 'Sent to paid media', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
];

const BOOSTING_STATUSES = [
  { value: 'not_boosting', label: 'Not boosting', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  { value: 'working_on_it', label: 'Working on it', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'done', label: 'Done', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
];

function getStatusConfig(statuses: typeof ASSIGNMENT_STATUSES, value: string) {
  return statuses.find(s => s.value === value) ?? statuses[0];
}

// ─── Status Pill Component ───────────────────────────────────────────────────

function StatusPill({
  value,
  statuses,
  field,
  itemId,
  onUpdate,
}: {
  value: string;
  statuses: typeof ASSIGNMENT_STATUSES;
  field: string;
  itemId: string;
  onUpdate: (id: string, field: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const config = getStatusConfig(statuses, value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border cursor-pointer transition-colors whitespace-nowrap ${config.color}`}
      >
        {config.label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl py-1 min-w-[160px]">
            {statuses.map(s => (
              <button
                key={s.value}
                onClick={() => { onUpdate(itemId, field, s.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer hover:bg-surface-hover ${
                  s.value === value ? 'text-text-primary font-medium' : 'text-text-muted'
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${s.color.split(' ')[0]}`} />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Person Cell ─────────────────────────────────────────────────────────────

function PersonCell({
  value,
  field,
  itemId,
  teamMembers,
  onUpdate,
}: {
  value: string | null;
  field: string;
  itemId: string;
  teamMembers: TeamMember[];
  onUpdate: (id: string, field: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-text-secondary hover:text-text-primary cursor-pointer truncate max-w-[100px] block"
        title={value ?? 'Unassigned'}
      >
        {value ?? <span className="text-text-muted">—</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-surface border border-nativz-border rounded-xl shadow-xl py-1 min-w-[160px] max-h-48 overflow-y-auto">
            <button
              onClick={() => { onUpdate(itemId, field, ''); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover cursor-pointer"
            >
              Unassigned
            </button>
            {teamMembers.map(m => (
              <button
                key={m.id}
                onClick={() => { onUpdate(itemId, field, m.full_name); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover cursor-pointer flex items-center gap-2"
              >
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-surface-hover" />
                )}
                <span className="truncate">{m.full_name}</span>
                <span className="text-[10px] text-text-muted ml-auto">{m.role}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Add Client Modal ────────────────────────────────────────────────────────

function AddClientModal({
  open,
  onClose,
  monthLabel,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  monthLabel: string;
  onAdd: (name: string, agency?: string) => void;
}) {
  const [name, setName] = useState('');
  const [agency, setAgency] = useState('Nativz');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl border border-nativz-border shadow-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Add client to {monthLabel}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Client name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Weston Funding"
              className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-text-muted mb-1 block">Agency</label>
            <select
              value={agency}
              onChange={e => setAgency(e.target.value)}
              className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary"
            >
              <option value="Nativz">Nativz</option>
              <option value="AC">AC</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <GlassButton onClick={() => { if (name.trim()) { onAdd(name.trim(), agency); setName(''); onClose(); } }}>
            Add
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Kanban View ────────────────────────────────────────────────────

function PipelineKanban({
  items,
  teamMembers,
  onUpdate,
  onDelete,
}: {
  items: PipelineItem[];
  teamMembers: TeamMember[];
  onUpdate: (id: string, field: string, value: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Group by editing_status
  const columns = EDITING_STATUSES.map(status => ({
    ...status,
    items: items.filter(item => item.editing_status === status.value),
  }));

  function completionProgress(item: PipelineItem): number {
    let done = 0;
    const total = 5;
    if (item.assignment_status === 'assigned') done++;
    if (item.raws_status === 'uploaded') done++;
    if (['em_approved', 'scheduled', 'done'].includes(item.editing_status)) done++;
    if (['client_approved', 'sent_to_paid_media'].includes(item.client_approval_status)) done++;
    if (item.boosting_status === 'done') done++;
    return Math.round((done / total) * 100);
  }

  function handleDragStart(e: React.DragEvent, itemId: string) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
    setDraggingId(itemId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  function handleDragOver(e: React.DragEvent, colValue: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colValue) setDragOverCol(colValue);
  }

  function handleDragLeave(e: React.DragEvent, colValue: string) {
    // Only clear if leaving the column itself, not a child
    if (dragOverCol === colValue && !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  }

  function handleDrop(e: React.DragEvent, colValue: string) {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    setDragOverCol(null);
    setDraggingId(null);
    if (itemId) {
      const item = items.find(i => i.id === itemId);
      if (item && item.editing_status !== colValue) {
        onUpdate(itemId, 'editing_status', colValue);
      }
    }
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="flex gap-3 p-4 min-w-max h-full">
        {columns.map(col => (
          <div
            key={col.value}
            className={`w-[240px] flex flex-col shrink-0 rounded-xl transition-colors ${
              dragOverCol === col.value ? 'bg-accent/5 ring-1 ring-accent/20' : ''
            }`}
            onDragOver={e => handleDragOver(e, col.value)}
            onDragLeave={e => handleDragLeave(e, col.value)}
            onDrop={e => handleDrop(e, col.value)}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-2 py-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${col.color.split(' ')[0]}`} />
              <span className="text-xs font-semibold text-text-secondary">{col.label}</span>
              <span className="text-[10px] text-text-muted ml-auto">{col.items.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 overflow-y-auto px-1 pb-1">
              {col.items.map(item => {
                const progress = completionProgress(item);
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => handleDragStart(e, item.id)}
                    onDragEnd={handleDragEnd}
                    className={`rounded-xl border border-nativz-border bg-surface p-3 space-y-2 group hover:border-accent/30 transition-all cursor-grab active:cursor-grabbing ${
                      draggingId === item.id ? 'opacity-40 scale-95' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text-primary truncate">{item.client_name}</span>
                      {item.agency && (
                        <Badge variant={item.agency === 'Nativz' ? 'info' : 'success'} className="text-[9px] px-1 py-0 shrink-0 ml-1">
                          {item.agency}
                        </Badge>
                      )}
                    </div>

                    {/* Editor */}
                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                      <PersonCell value={item.editor} field="editor" itemId={item.id} teamMembers={teamMembers} onUpdate={onUpdate} />
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-surface-hover overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent-text transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-text-muted">{progress}%</span>
                    </div>

                    {/* Shoot date */}
                    {item.shoot_date && (
                      <p className="text-[10px] text-text-muted">
                        Shoot: {new Date(item.shoot_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    )}

                    {/* Status change */}
                    <StatusPill value={item.editing_status} statuses={EDITING_STATUSES} field="editing_status" itemId={item.id} onUpdate={onUpdate} />

                    {/* Delete on hover */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onDelete(item.id, item.client_name)}
                        className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {/* Empty column drop zone */}
              {col.items.length === 0 && (
                <div className="h-20 rounded-lg border border-dashed border-nativz-border/50 flex items-center justify-center">
                  <span className="text-[10px] text-text-muted/50">Drop here</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Pipeline View (Client Component) ──────────────────────────────────

type PipelineView = 'table' | 'kanban';

interface PipelineViewProps {
  initialItems: PipelineItem[];
  initialTeamMembers: TeamMember[];
  initialMonth: string;
}

export default function PipelineViewComponent({
  initialItems,
  initialTeamMembers,
  initialMonth,
}: PipelineViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<PipelineItem[]>(initialItems);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(initialTeamMembers);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<PipelineView>((searchParams.get('view') as PipelineView) || 'table');
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [showAdd, setShowAdd] = useState(false);

  const { confirm, dialog: confirmDialog } = useConfirm({
    title: 'Remove from pipeline',
    description: 'This client will be removed from the current month. This cannot be undone.',
    confirmLabel: 'Remove',
    variant: 'danger',
  });

  const monthLabel = (() => {
    const d = new Date(currentMonth + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  })();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [pipelineRes, teamRes] = await Promise.all([
        fetch(`/api/pipeline?month=${currentMonth}`),
        fetch('/api/team'),
      ]);
      if (pipelineRes.ok) {
        const data = await pipelineRes.json();
        setItems(data.items ?? []);
      }
      if (teamRes.ok) {
        const data = await teamRes.json();
        setTeamMembers(data.members ?? data ?? []);
      }
    } catch {
      toast.error('Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  function navigateMonth(dir: -1 | 1) {
    const d = new Date(currentMonth + 'T00:00:00');
    d.setMonth(d.getMonth() + dir);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    setCurrentMonth(newMonth);
    // Fetch new data when month changes
    setLoading(true);
    fetch(`/api/pipeline?month=${newMonth}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setItems(data.items ?? []); })
      .catch(() => toast.error('Failed to load pipeline'))
      .finally(() => setLoading(false));
  }

  async function handleUpdate(itemId: string, field: string, value: string) {
    // Optimistic update
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, [field]: value || null } : item
    ));

    try {
      const res = await fetch(`/api/pipeline/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to update');
      fetchItems();
    }
  }

  async function handleAdd(name: string, agency?: string) {
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: name,
          month_label: monthLabel,
          month_date: currentMonth,
          agency,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${name} added to ${monthLabel}`);
      fetchItems();
    } catch {
      toast.error('Failed to add client');
    }
  }

  async function handleDelete(itemId: string, name: string) {
    const ok = await confirm();
    if (!ok) return;
    try {
      const res = await fetch(`/api/pipeline/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setItems(prev => prev.filter(i => i.id !== itemId));
      toast.success('Removed');
    } catch {
      toast.error('Failed to delete');
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-nativz-border bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-text-primary">Content pipeline</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => navigateMonth(-1)} className="p-1 rounded-lg hover:bg-surface-hover text-text-muted cursor-pointer">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-text-primary min-w-[140px] text-center">{monthLabel}</span>
            <button onClick={() => navigateMonth(1)} className="p-1 rounded-lg hover:bg-surface-hover text-text-muted cursor-pointer">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex items-center rounded-lg border border-nativz-border overflow-hidden">
            {([
              { view: 'table' as PipelineView, icon: Table2, label: 'Table' },
              { view: 'kanban' as PipelineView, icon: Kanban, label: 'Kanban' },
            ]).map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => {
                  setActiveView(view);
                  router.push(`/admin/pipeline?view=${view}`, { scroll: false });
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                  activeView === view
                    ? 'bg-surface-hover text-text-primary font-medium'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
                title={label}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" onClick={fetchItems}>
            <RefreshCw size={14} />
          </Button>
          <GlassButton onClick={() => setShowAdd(true)}>
            <Plus size={14} />
            Add client
          </GlassButton>
        </div>
      </div>

      {/* Content views */}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <p className="text-sm text-text-muted mb-2">No clients in the pipeline for {monthLabel}</p>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} />
            Add client
          </Button>
        </div>
      ) : activeView === 'kanban' ? (
        <PipelineKanban items={items} teamMembers={teamMembers} onUpdate={handleUpdate} onDelete={handleDelete} />
      ) : (
        /* Table view (default) */
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-nativz-border bg-background sticky top-0 z-10">
                <th className="text-left text-[11px] font-medium text-text-muted px-4 py-2.5 whitespace-nowrap">Client</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Assignment</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">RAWs</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Editing</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Approval</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Boosting</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Strategist</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Videographer</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Editor</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">SMM</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Shoot date</th>
                <th className="text-left text-[11px] font-medium text-text-muted px-3 py-2.5 whitespace-nowrap">Links</th>
                <th className="px-2 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-nativz-border hover:bg-surface-hover/50 transition-colors">
                  {/* Client name */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{item.client_name}</span>
                      {item.agency && (
                        <Badge variant={item.agency === 'Nativz' ? 'info' : 'success'} className="text-[9px] px-1 py-0">
                          {item.agency}
                        </Badge>
                      )}
                    </div>
                  </td>

                  {/* Status columns */}
                  <td className="px-3 py-2.5">
                    <StatusPill value={item.assignment_status} statuses={ASSIGNMENT_STATUSES} field="assignment_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill value={item.raws_status} statuses={RAWS_STATUSES} field="raws_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill value={item.editing_status} statuses={EDITING_STATUSES} field="editing_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill value={item.client_approval_status} statuses={APPROVAL_STATUSES} field="client_approval_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill value={item.boosting_status} statuses={BOOSTING_STATUSES} field="boosting_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>

                  {/* Team members */}
                  <td className="px-3 py-2.5">
                    <PersonCell value={item.strategist} field="strategist" itemId={item.id} teamMembers={teamMembers} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-2.5">
                    <PersonCell value={item.videographer} field="videographer" itemId={item.id} teamMembers={teamMembers} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-2.5">
                    <PersonCell value={item.editor} field="editor" itemId={item.id} teamMembers={teamMembers} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-2.5">
                    <PersonCell value={item.smm} field="smm" itemId={item.id} teamMembers={teamMembers} onUpdate={handleUpdate} />
                  </td>

                  {/* Shoot date */}
                  <td className="px-3 py-2.5">
                    <input
                      type="date"
                      value={item.shoot_date ?? ''}
                      onChange={e => handleUpdate(item.id, 'shoot_date', e.target.value)}
                      className="bg-transparent border-none text-xs text-text-secondary w-[110px] cursor-pointer"
                    />
                  </td>

                  {/* Links */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      {item.edited_videos_folder_url && (
                        <a href={extractUrl(item.edited_videos_folder_url)!} target="_blank" rel="noopener noreferrer" title="Edited videos folder"
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-accent-text">
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {item.raws_folder_url && (
                        <a href={extractUrl(item.raws_folder_url)!} target="_blank" rel="noopener noreferrer" title="RAWs folder"
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-accent-text">
                          <ExternalLink size={12} />
                        </a>
                      )}
                      {item.later_calendar_link && (
                        <a href={extractUrl(item.later_calendar_link)!} target="_blank" rel="noopener noreferrer" title="Calendar link"
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-accent-text">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => handleDelete(item.id, item.client_name)}
                      className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddClientModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        monthLabel={monthLabel}
        onAdd={handleAdd}
      />
      {confirmDialog}
    </div>
  );
}
