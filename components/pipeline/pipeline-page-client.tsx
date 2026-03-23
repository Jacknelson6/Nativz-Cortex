'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Plus, Loader2, ChevronLeft, ChevronRight, RefreshCw,
  Kanban, List, Table2,
  FolderOpen, HardDrive, Calendar, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

import {
  PipelineItem,
  TeamMember,
  PipelineViewMode,
  ROLE_BOARD_CONFIGS,
  DEFAULT_BOARD_CONFIG,
  ASSIGNMENT_STATUSES,
  RAWS_STATUSES,
  EDITING_STATUSES,
  APPROVAL_STATUSES,
  BOOSTING_STATUSES,
  getRowProgressBorder,
  extractUrl,
} from './pipeline-types';
import { StatusPill } from './status-pill';
import { PersonCell } from './person-cell';
import { PipelineDetailPanel } from './pipeline-detail-panel';
import { PipelineFilters, PipelineSummary } from './pipeline-filters';
import { PipelineBoard } from './pipeline-board';
import { PipelineList } from './pipeline-list';

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

// ─── Pipeline Page Client ────────────────────────────────────────────────────

interface PipelinePageClientProps {
  initialItems: PipelineItem[];
  initialTeamMembers: TeamMember[];
  initialMonth: string;
  userTeamMember: { id: string; full_name: string; role: string } | null;
  isOwner: boolean;
}

export default function PipelinePageClient({
  initialItems,
  initialTeamMembers,
  initialMonth,
  userTeamMember,
  isOwner,
}: PipelinePageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<PipelineItem[]>(initialItems);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(initialTeamMembers);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [selectedItem, setSelectedItem] = useState<PipelineItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // View mode — owners default to list, others to board
  const defaultView: PipelineViewMode = isOwner ? 'list' : 'board';
  const [activeView, setActiveView] = useState<PipelineViewMode>(
    (searchParams.get('view') as PipelineViewMode) || defaultView
  );

  // Stage filter from sidebar navigation (editing, scheduling, boosting)
  const stageParam = searchParams.get('stage') as 'editing' | 'scheduling' | 'boosting' | null;

  // Filter state — myClientsOnly defaults on for non-owners
  const [myClientsOnly, setMyClientsOnly] = useState(!isOwner);
  const [statusFilter, setStatusFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [search, setSearch] = useState('');

  const { confirm, dialog: confirmDialog } = useConfirm({
    title: 'Remove from pipeline',
    description: 'This client will be removed from the current month. This cannot be undone.',
    confirmLabel: 'Remove',
    variant: 'danger',
  });

  // ── Computed ─────────────────────────────────────────────────────────────

  const boardConfig = useMemo(() => {
    if (userTeamMember?.role && userTeamMember.role in ROLE_BOARD_CONFIGS) {
      return ROLE_BOARD_CONFIGS[userTeamMember.role];
    }
    return DEFAULT_BOARD_CONFIG;
  }, [userTeamMember]);

  const monthLabel = useMemo(() => {
    const d = new Date(currentMonth + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [currentMonth]);

  const filteredItems = useMemo(() => {
    let result = items;

    // Stage filter from sidebar — show items relevant to that pipeline phase
    if (stageParam === 'editing') {
      // Editing stage: raws uploaded but editing not finished
      result = result.filter(item =>
        item.raws_status === 'uploaded' &&
        !['em_approved', 'scheduled', 'done'].includes(item.editing_status)
      );
    } else if (stageParam === 'scheduling') {
      // Scheduling stage: editing done, awaiting client approval or scheduling
      result = result.filter(item =>
        ['em_approved', 'scheduled', 'done'].includes(item.editing_status) &&
        !['client_approved', 'sent_to_paid_media'].includes(item.client_approval_status)
      );
    } else if (stageParam === 'boosting') {
      // Boosting stage: approved, needs boosting
      result = result.filter(item =>
        ['client_approved', 'sent_to_paid_media'].includes(item.client_approval_status) &&
        item.boosting_status !== 'done'
      );
    }

    if (myClientsOnly && userTeamMember) {
      const name = userTeamMember.full_name;
      result = result.filter(item =>
        item.strategist === name ||
        item.videographer === name ||
        item.editing_manager === name ||
        item.editor === name ||
        item.smm === name
      );
    }

    if (statusFilter) {
      result = result.filter(item => item.editing_status === statusFilter);
    }

    if (agencyFilter) {
      result = result.filter(item => item.agency === agencyFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(item => item.client_name.toLowerCase().includes(q));
    }

    return result;
  }, [items, stageParam, myClientsOnly, userTeamMember, statusFilter, agencyFilter, search]);

  // ── API Handlers ─────────────────────────────────────────────────────────

  const fetchItems = useCallback(async (month?: string) => {
    const targetMonth = month ?? currentMonth;
    setLoading(true);
    try {
      const [pipelineRes, teamRes] = await Promise.all([
        fetch(`/api/pipeline?month=${targetMonth}`),
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
    fetchItems(newMonth);
  }

  const handleUpdate = useCallback(async (itemId: string, field: string, value: string) => {
    // Optimistic update
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, [field]: value || null } : item
    ));

    // Also update selected item if it's the one being edited
    setSelectedItem(prev =>
      prev && prev.id === itemId ? { ...prev, [field]: value || null } : prev
    );

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
  }, [fetchItems]);

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
      setSelectedItem(prev => prev?.id === itemId ? null : prev);
      toast.success('Removed');
    } catch {
      toast.error('Failed to delete');
    }
  }

  function changeView(view: PipelineViewMode) {
    setActiveView(view);
    const params = new URLSearchParams();
    params.set('view', view);
    if (stageParam) params.set('stage', stageParam);
    router.push(`/admin/pipeline?${params.toString()}`, { scroll: false });
  }

  // ── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-nativz-border bg-surface shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-5 w-36 rounded bg-surface-hover animate-pulse" />
            <div className="h-5 w-40 rounded bg-surface-hover animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 rounded-lg bg-surface-hover animate-pulse" />
            <div className="h-8 w-24 rounded-lg bg-surface-hover animate-pulse" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-nativz-border bg-background">
                {Array.from({ length: 7 }).map((_, i) => (
                  <th key={i} className="px-4 py-2.5">
                    <div className="h-3 w-16 rounded bg-surface-hover animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, row) => (
                <tr key={row} className="border-b border-nativz-border">
                  <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-surface-hover animate-pulse" /></td>
                  {Array.from({ length: 6 }).map((_, col) => (
                    <td key={col} className="px-3 py-3"><div className="h-5 w-20 rounded-full bg-surface-hover animate-pulse" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-nativz-border bg-surface shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="ui-section-title">
            Content pipeline
            {stageParam && (
              <span className="ml-2 text-sm font-medium text-accent-text capitalize">&middot; {stageParam}</span>
            )}
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={() => navigateMonth(-1)} className="p-1 rounded-lg hover:bg-surface-hover text-text-muted cursor-pointer">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-text-primary min-w-[140px] text-center">
              {monthLabel}
              {items.length > 0 && (
                <span className="ml-1.5 text-[11px] font-normal text-text-muted">({items.length} clients)</span>
              )}
            </span>
            <button onClick={() => navigateMonth(1)} className="p-1 rounded-lg hover:bg-surface-hover text-text-muted cursor-pointer">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex items-center rounded-lg border border-nativz-border overflow-hidden">
            {([
              { view: 'board' as PipelineViewMode, icon: Kanban, label: 'Board' },
              { view: 'list' as PipelineViewMode, icon: List, label: 'List' },
              { view: 'table' as PipelineViewMode, icon: Table2, label: 'Table' },
            ]).map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => changeView(view)}
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

          <Button variant="ghost" size="sm" onClick={() => fetchItems()}>
            <RefreshCw size={14} />
          </Button>
          <GlassButton onClick={() => setShowAdd(true)}>
            <Plus size={14} />
            Add client
          </GlassButton>
        </div>
      </div>

      {/* Filters */}
      <PipelineFilters
        myClientsOnly={myClientsOnly}
        onMyClientsToggle={setMyClientsOnly}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        agencyFilter={agencyFilter}
        onAgencyFilter={setAgencyFilter}
        search={search}
        onSearch={setSearch}
        isOwner={isOwner}
      />

      {/* Summary */}
      {items.length > 0 && (
        <PipelineSummary
          items={items}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
        />
      )}

      {/* Content */}
      {filteredItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <p className="text-sm text-text-muted mb-2">
            {items.length === 0
              ? `No clients in the pipeline for ${monthLabel}`
              : 'No clients match your filters'}
          </p>
          {items.length === 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} />
              Add client
            </Button>
          )}
        </div>
      ) : activeView === 'board' ? (
        <PipelineBoard
          items={filteredItems}
          teamMembers={teamMembers}
          boardConfig={boardConfig}
          onUpdate={handleUpdate}
          onSelect={setSelectedItem}
          onDelete={handleDelete}
        />
      ) : activeView === 'list' ? (
        <PipelineList
          items={filteredItems}
          teamMembers={teamMembers}
          onUpdate={handleUpdate}
          onSelect={setSelectedItem}
          onDelete={handleDelete}
        />
      ) : (
        /* Table view (full columns for backward compat) */
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
              {filteredItems.map(item => (
                <tr
                  key={item.id}
                  className={`border-b border-nativz-border hover:bg-surface-hover/50 transition-colors cursor-pointer border-l-2 ${getRowProgressBorder(item)}`}
                  onClick={() => setSelectedItem(item)}
                >
                  {/* Client name */}
                  <td className="px-4 py-3">
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
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <StatusPill value={item.assignment_status} statuses={ASSIGNMENT_STATUSES} field="assignment_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <StatusPill value={item.raws_status} statuses={RAWS_STATUSES} field="raws_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <StatusPill value={item.editing_status} statuses={EDITING_STATUSES} field="editing_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <StatusPill value={item.client_approval_status} statuses={APPROVAL_STATUSES} field="client_approval_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <StatusPill value={item.boosting_status} statuses={BOOSTING_STATUSES} field="boosting_status" itemId={item.id} onUpdate={handleUpdate} />
                  </td>

                  {/* Team members */}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <PersonCell value={item.strategist} field="strategist" itemId={item.id} teamMembers={teamMembers} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <PersonCell value={item.videographer} field="videographer" itemId={item.id} teamMembers={teamMembers} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <PersonCell value={item.editor} field="editor" itemId={item.id} teamMembers={teamMembers} onUpdate={handleUpdate} />
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <PersonCell value={item.smm} field="smm" itemId={item.id} teamMembers={teamMembers} onUpdate={handleUpdate} />
                  </td>

                  {/* Shoot date */}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="date"
                      value={item.shoot_date ?? ''}
                      onChange={e => handleUpdate(item.id, 'shoot_date', e.target.value)}
                      className="bg-transparent border-none text-xs text-text-secondary w-[110px] cursor-pointer [color-scheme:dark]"
                    />
                  </td>

                  {/* Links */}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {item.edited_videos_folder_url && (
                        <a href={extractUrl(item.edited_videos_folder_url)!} target="_blank" rel="noopener noreferrer" title="Edited videos folder"
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-accent-text">
                          <FolderOpen size={12} />
                        </a>
                      )}
                      {item.raws_folder_url && (
                        <a href={extractUrl(item.raws_folder_url)!} target="_blank" rel="noopener noreferrer" title="RAWs folder"
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-accent-text">
                          <HardDrive size={12} />
                        </a>
                      )}
                      {item.later_calendar_link && (
                        <a href={extractUrl(item.later_calendar_link)!} target="_blank" rel="noopener noreferrer" title="Calendar link"
                          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-accent-text">
                          <Calendar size={12} />
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
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

      {/* Detail Panel */}
      <PipelineDetailPanel
        key={selectedItem?.id}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        teamMembers={teamMembers}
      />

      {/* Add Client Modal */}
      <AddClientModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        monthLabel={monthLabel}
        onAdd={handleAdd}
      />

      {/* Confirm Dialog */}
      {confirmDialog}
    </div>
  );
}
