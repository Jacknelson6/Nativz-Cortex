'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  UserX,
  LayoutGrid,
  List,
  Trash2,
  Loader2,
  Eye,
  Plus,
  MoreHorizontal,
  Check,
  FolderPlus,
  ArrowRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HealthBadge } from '@/components/clients/health-badge';
import { AgencyAssignmentLabel } from '@/components/clients/agency-assignment-label';
import { ClientLogo } from '@/components/clients/client-logo';
import { formatRelativeTime } from '@/lib/utils/format';
import { toast } from 'sonner';

interface ClientItem {
  dbId?: string;
  name: string;
  slug: string;
  abbreviation?: string;
  industry: string;
  services: string[];
  agency?: string;
  isActive?: boolean;
  logoUrl?: string | null;
  healthScore?: string | null;
  lastActivityAt?: string | null;
  organizationId?: string | null;
  groupId?: string | null;
}

interface ClientGroup {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

const STANDARD_SERVICES = ['SMM', 'Paid Media', 'Affiliates', 'Editing'] as const;
const STAGGER_CAP = 12;
const STAGGER_MS = 28;

// ─── Group color palette ───────────────────────────────────────────────────
// Curated palette. Key stored in DB; these map to visible styles. Keeping
// colors as literal class strings so Tailwind's JIT sees them and doesn't
// tree-shake — `bg-${x}` patterns would break the build.

type ColorKey = 'cyan' | 'purple' | 'coral' | 'emerald' | 'amber' | 'rose' | 'teal' | 'slate';

const GROUP_COLORS: { key: ColorKey; label: string; dot: string; soft: string; text: string }[] = [
  { key: 'cyan',    label: 'Cyan',    dot: 'bg-[#00AEEF]', soft: 'bg-[#00AEEF]/10',   text: 'text-[#5CC8F2]' },
  { key: 'purple',  label: 'Purple',  dot: 'bg-[#9314CE]', soft: 'bg-[#9314CE]/10',   text: 'text-[#B85CE3]' },
  { key: 'coral',   label: 'Coral',   dot: 'bg-[#ED6B63]', soft: 'bg-[#ED6B63]/10',   text: 'text-[#F08A83]' },
  { key: 'emerald', label: 'Emerald', dot: 'bg-emerald-500', soft: 'bg-emerald-500/10', text: 'text-emerald-400' },
  { key: 'amber',   label: 'Amber',   dot: 'bg-amber-500',   soft: 'bg-amber-500/10',   text: 'text-amber-400' },
  { key: 'rose',    label: 'Rose',    dot: 'bg-rose-500',    soft: 'bg-rose-500/10',    text: 'text-rose-400' },
  { key: 'teal',    label: 'Teal',    dot: 'bg-teal-500',    soft: 'bg-teal-500/10',    text: 'text-teal-400' },
  { key: 'slate',   label: 'Slate',   dot: 'bg-slate-500',   soft: 'bg-slate-500/10',   text: 'text-slate-300' },
];

function colorStyles(key: string | undefined) {
  return GROUP_COLORS.find((c) => c.key === key) ?? GROUP_COLORS[GROUP_COLORS.length - 1];
}

function normalizeServices(raw: string[]): string[] {
  const result = new Set<string>();
  for (const s of raw) {
    const lower = s.toLowerCase();
    if (STANDARD_SERVICES.includes(s as typeof STANDARD_SERVICES[number])) {
      result.add(s);
    } else if (lower.includes('social media') || lower === 'smm') {
      result.add('SMM');
    } else if (lower.includes('paid media') || lower.includes('paid ads') || lower.includes('ppc')) {
      result.add('Paid Media');
    } else if (lower.includes('editing') || lower.includes('videography') || lower.includes('content creation') || lower.includes('video')) {
      result.add('Editing');
    } else if (lower.includes('affiliate')) {
      result.add('Affiliates');
    }
  }
  return STANDARD_SERVICES.filter((s) => result.has(s));
}

type AgencyBucket = 'nativz' | 'anderson' | 'internal' | 'other';

function bucketFor(agency?: string | null): AgencyBucket {
  const a = (agency ?? '').toLowerCase();
  if (a.includes('nativz')) return 'nativz';
  if (a.includes('anderson') || a === 'ac') return 'anderson';
  if (a === 'internal') return 'internal';
  return 'other';
}

const BUCKET_LABEL: Record<AgencyBucket, string> = {
  nativz: 'Nativz',
  anderson: 'Anderson Collaborative',
  internal: 'Internal',
  other: 'Unassigned',
};

const BUCKET_ORDER: AgencyBucket[] = ['nativz', 'anderson', 'internal', 'other'];

// ─── Spotlight card — ref-based, zero re-renders on mouse move ─────────────

function SpotlightCard({
  children,
  className = '',
  dimmed,
}: {
  children: React.ReactNode;
  className?: string;
  dimmed?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  }, []);

  const spotColor = dimmed ? 'rgba(120, 130, 140, 0.08)' : 'rgba(0, 174, 239, 0.10)';

  return (
    <div ref={ref} onMouseMove={handleMove} className={`relative overflow-hidden ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 ease-out"
        style={{
          background: `radial-gradient(320px circle at var(--mx, 50%) var(--my, 50%), ${spotColor}, transparent 70%)`,
        }}
      />
      {children}
    </div>
  );
}

// ─── Move-to-group menu ────────────────────────────────────────────────────

function MoveToGroupMenu({
  groups,
  currentGroupId,
  onMove,
}: {
  groups: ClientGroup[];
  currentGroupId: string | null | undefined;
  onMove: (groupId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded-md p-1.5 text-text-muted hover:text-accent-text hover:bg-accent-surface/30 cursor-pointer transition-colors"
        title="Move to group"
        aria-label="Move to group"
      >
        <ArrowRight size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 min-w-[200px] rounded-lg border border-nativz-border bg-surface shadow-xl animate-[popIn_150ms_ease-out] py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted/70">
            Move to
          </div>
          {groups.map((g) => {
            const s = colorStyles(g.color);
            const active = g.id === currentGroupId;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => { setOpen(false); onMove(g.id); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors text-left"
              >
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                <span className="flex-1 truncate">{g.name}</span>
                {active && <Check size={12} className="text-accent-text" />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-nativz-border/60" />
          <button
            type="button"
            onClick={() => { setOpen(false); onMove(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover transition-colors text-left"
          >
            <span className="h-2 w-2 rounded-full bg-slate-600" />
            <span className="flex-1">Unassigned</span>
            {!currentGroupId && <Check size={12} className="text-accent-text" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Client card ───────────────────────────────────────────────────────────

function ClientCard({
  client,
  i,
  dimmed,
  listView,
  groups,
  onNavigate,
  onImpersonate,
  onRequestDelete,
  onMoveGroup,
  deleting,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  client: ClientItem;
  i: number;
  dimmed?: boolean;
  listView?: boolean;
  groups: ClientGroup[];
  onNavigate: () => void;
  onImpersonate: () => void;
  onRequestDelete: () => void;
  onMoveGroup: (groupId: string | null) => void;
  deleting?: boolean;
  /** Only true when groups exist — drag targets don't exist otherwise. */
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (dbId: string) => void;
  onDragEnd?: () => void;
}) {
  const staggerDelay = `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms`;

  const actionButtons = (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
      {groups.length > 0 && client.dbId && (
        <MoveToGroupMenu
          groups={groups}
          currentGroupId={client.groupId}
          onMove={onMoveGroup}
        />
      )}
      {client.organizationId && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onImpersonate(); }}
          className="rounded-md p-1.5 text-text-muted hover:text-accent-text hover:bg-accent-surface/30 cursor-pointer transition-colors"
          title={`View portal as ${client.name}`}
          aria-label={`View portal as ${client.name}`}
        >
          <Eye size={14} />
        </button>
      )}
      {client.dbId && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRequestDelete(); }}
          disabled={deleting}
          className="rounded-md p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors disabled:cursor-wait"
          title={`Delete ${client.name}`}
          aria-label={`Delete ${client.name}`}
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      )}
    </div>
  );

  if (listView) {
    return (
      <div
        role="button"
        tabIndex={0}
        draggable={draggable && !!client.dbId}
        onDragStart={(e) => {
          if (!draggable || !client.dbId) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', client.dbId);
          onDragStart?.(client.dbId);
        }}
        onDragEnd={() => onDragEnd?.()}
        onClick={onNavigate}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(); } }}
        className={`group w-full text-left cursor-pointer focus:outline-none animate-stagger-in ${deleting ? 'pointer-events-none opacity-50' : ''} ${dragging ? 'opacity-40 scale-[0.99]' : ''} transition-[opacity,transform] duration-150`}
        style={{ animationDelay: staggerDelay }}
      >
        <div
          className={`flex items-center gap-3 rounded-[10px] border border-nativz-border-light px-4 py-3 hover:bg-surface-hover focus-visible:ring-1 focus-visible:ring-accent-border transition-colors ${dimmed ? 'opacity-55 hover:opacity-80' : ''}`}
        >
          <ClientLogo src={client.logoUrl} name={client.name} abbreviation={client.abbreviation} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[15px] font-medium text-text-primary truncate" title={client.name}>{client.name}</p>
              {client.abbreviation && <span className="shrink-0 text-[11px] font-medium text-text-muted">{client.abbreviation}</span>}
            </div>
            <p className="text-[12px] text-text-muted truncate">{client.industry || 'General'}</p>
          </div>
          <AgencyAssignmentLabel agency={client.agency} showWhenUnassigned className="shrink-0 hidden sm:block" />
          {client.services.length > 0 && (
            <div className="hidden md:flex gap-1 shrink-0">
              {client.services.map((s) => <Badge key={s} className="text-[11px] px-1.5 py-0">{s}</Badge>)}
            </div>
          )}
          {client.lastActivityAt && (
            <span className="text-[12px] text-text-muted shrink-0 hidden lg:block tabular-nums">
              {formatRelativeTime(client.lastActivityAt)}
            </span>
          )}
          <HealthBadge healthScore={client.healthScore} />
          {actionButtons}
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable && !!client.dbId}
      onDragStart={(e) => {
        if (!draggable || !client.dbId) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', client.dbId);
        onDragStart?.(client.dbId);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onNavigate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(); } }}
      className={`group w-full text-left focus:outline-none animate-stagger-in ${deleting ? 'pointer-events-none opacity-50' : ''} ${dragging ? 'opacity-40 scale-[0.98]' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} transition-[opacity,transform] duration-150`}
      style={{ animationDelay: staggerDelay }}
    >
      <SpotlightCard
        dimmed={dimmed}
        className={`rounded-[10px] border border-nativz-border bg-surface p-4 transition-colors duration-200 hover:border-accent-border/50 focus-within:border-accent-border/50 ${dimmed ? 'opacity-55 hover:opacity-80' : ''}`}
      >
        <div className="relative flex items-start gap-3">
          <ClientLogo src={client.logoUrl} name={client.name} abbreviation={client.abbreviation} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[15px] font-medium text-text-primary truncate leading-tight" title={client.name}>{client.name}</p>
                  {client.abbreviation && <span className="shrink-0 text-[11px] font-medium text-text-muted">{client.abbreviation}</span>}
                </div>
                <p className="text-[13px] text-text-muted truncate mt-0.5">{client.industry || 'General'}</p>
              </div>
              <HealthBadge
                healthScore={client.healthScore}
                className="shrink-0 mt-0.5 transition-opacity duration-200 group-hover:opacity-0 group-focus-within:opacity-0"
              />
            </div>

            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <AgencyAssignmentLabel agency={client.agency} showWhenUnassigned />
              {client.services.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {client.services.map((s) => <Badge key={s} className="text-[11px] px-1.5 py-0 shrink-0">{s}</Badge>)}
                </div>
              )}
              {client.lastActivityAt && (
                <span className="ml-auto text-[11px] text-text-muted tabular-nums">
                  {formatRelativeTime(client.lastActivityAt)}
                </span>
              )}
            </div>
          </div>
          <div className="absolute top-0 right-0">{actionButtons}</div>
        </div>
      </SpotlightCard>
    </div>
  );
}

// ─── Group section header ──────────────────────────────────────────────────

function GroupSectionHeader({
  group,
  count,
  onRename,
  onRecolor,
  onDelete,
}: {
  group: ClientGroup;
  count: number;
  onRename: (name: string) => void;
  onRecolor: (color: ColorKey) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const rootRef = useRef<HTMLDivElement>(null);
  const s = colorStyles(group.color);

  useEffect(() => setDraftName(group.name), [group.name]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (renaming) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = draftName.trim();
          if (v && v !== group.name) onRename(v);
          setRenaming(false);
        }}
        className="flex items-center gap-2 pb-1"
      >
        <span className={`h-2 w-2 rounded-full ${s.dot} shrink-0`} />
        <input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => {
            const v = draftName.trim();
            if (v && v !== group.name) onRename(v);
            setRenaming(false);
          }}
          className="bg-transparent text-[11px] font-semibold uppercase tracking-[0.12em] text-text-primary focus:outline-none border-b border-accent-border/50 pb-0.5"
        />
        <span className="text-[11px] text-text-muted/60 tabular-nums">{count}</span>
      </form>
    );
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-2 pb-1">
      <span className={`h-2.5 w-2.5 rounded-full ${s.dot} shrink-0`} />
      <h2
        className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-muted cursor-pointer hover:text-text-secondary"
        onClick={() => setRenaming(true)}
        title="Rename"
      >
        {group.name}
      </h2>
      <span className="text-[12px] text-text-muted/60 tabular-nums">{count}</span>
      <div className="flex-1 h-px bg-nativz-border/40 ml-1" />
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        aria-label={`Manage ${group.name}`}
        title="Manage"
      >
        <MoreHorizontal size={14} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-30 min-w-[220px] rounded-lg border border-nativz-border bg-surface shadow-xl animate-[popIn_150ms_ease-out] py-1.5">
          <button
            type="button"
            onClick={() => { setMenuOpen(false); setRenaming(true); }}
            className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors"
          >
            Rename
          </button>
          <div className="px-3 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted mb-1.5">Color</div>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => { setMenuOpen(false); onRecolor(c.key); }}
                  className={`h-5 w-5 rounded-full ${c.dot} ring-2 ring-offset-2 ring-offset-surface transition-all ${c.key === group.color ? 'ring-accent-border' : 'ring-transparent hover:ring-nativz-border'}`}
                  title={c.label}
                  aria-label={c.label}
                />
              ))}
            </div>
          </div>
          <div className="my-1 h-px bg-nativz-border/60" />
          <button
            type="button"
            onClick={() => { setMenuOpen(false); onDelete(); }}
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete group
          </button>
        </div>
      )}
    </div>
  );
}

// ─── New group inline form ─────────────────────────────────────────────────

function NewGroupForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, color: ColorKey) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<ColorKey>('cyan');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    const v = name.trim();
    if (!v) { onCancel(); return; }
    setSaving(true);
    try {
      await onCreate(v, color);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${colorStyles(color).dot} shrink-0`} />
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void submit(); }
            if (e.key === 'Escape') { onCancel(); }
          }}
          placeholder="Group name (e.g. Onboarding, Active, Pause)"
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          disabled={saving}
        />
      </div>
      <div className="flex items-center gap-1.5">
        {GROUP_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setColor(c.key)}
            className={`h-5 w-5 rounded-full ${c.dot} ring-2 ring-offset-2 ring-offset-surface transition-all ${c.key === color ? 'ring-accent-border' : 'ring-transparent hover:ring-nativz-border'}`}
            title={c.label}
            aria-label={c.label}
          />
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1 rounded-full bg-accent-text text-background px-3 py-1 text-xs font-semibold disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Create
        </button>
      </div>
    </div>
  );
}

// ─── Generic section header (agency fallback + inactive bucket) ────────────

function SectionHeader({
  label,
  count,
  icon,
}: {
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 pb-1">
      {icon}
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</h2>
      <span className="text-[12px] text-text-muted/60 tabular-nums">{count}</span>
      <div className="flex-1 h-px bg-nativz-border/40 ml-1" />
    </div>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────

type AgencyFilter = 'all' | 'nativz' | 'ac';

export function ClientSearchGrid({
  clients: rawClients,
  groups: initialGroups = [],
}: {
  clients: ClientItem[];
  groups?: ClientGroup[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const [allClients, setAllClients] = useState(() =>
    rawClients.map((c) => ({ ...c, services: normalizeServices(c.services) })),
  );
  const [groups, setGroups] = useState<ClientGroup[]>(initialGroups);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ dbId: string; name: string } | null>(null);
  const [pendingGroupDelete, setPendingGroupDelete] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [query, setQuery] = useState('');
  const [agencyFilter, setAgencyFilter] = useState<AgencyFilter>('all');
  const [listView, setListView] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  // Drag-drop state — a single card dragged at a time; target key is either
  // a group id, the sentinel 'unassigned', or null (no target).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const legacyClientParam = searchParams.get('client');
  useEffect(() => {
    if (!legacyClientParam) return;
    router.replace(`/admin/clients/${encodeURIComponent(legacyClientParam)}`);
  }, [legacyClientParam, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleDelete = useCallback(async (dbId: string) => {
    setDeletingId(dbId);
    try {
      const res = await fetch(`/api/clients/${dbId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
        const msg = [data.error ?? 'Failed to delete', data.details].filter(Boolean).join(' — ');
        throw new Error(msg);
      }
      setAllClients((prev) => prev.filter((c) => c.dbId !== dbId));
      toast.success('Client deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete client');
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleImpersonate = useCallback((organizationId: string, slug: string) => {
    fetch('/api/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: organizationId, client_slug: slug }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Impersonate failed'))))
      .then((data: { redirect: string }) => { window.location.href = data.redirect; })
      .catch(() => toast.error('Failed to impersonate'));
  }, []);

  const handleMoveGroup = useCallback(async (dbId: string, groupId: string | null) => {
    const prev = allClients;
    setAllClients((xs) => xs.map((c) => (c.dbId === dbId ? { ...c, groupId } : c)));
    try {
      const res = await fetch(`/api/clients/${dbId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
      if (!res.ok) throw new Error('Failed to move');
      const g = groupId ? groups.find((x) => x.id === groupId)?.name ?? 'group' : 'Unassigned';
      toast.success(`Moved to ${g}`);
    } catch {
      toast.error('Failed to move');
      setAllClients(prev);
    }
  }, [allClients, groups]);

  const handleCreateGroup = useCallback(async (name: string, color: ColorKey) => {
    try {
      const res = await fetch('/api/client-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || 'Failed to create group');
      }
      const { group } = await res.json() as { group: ClientGroup };
      setGroups((gs) => [...gs, group]);
      setShowNewGroup(false);
      toast.success(`Group "${group.name}" created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create group');
    }
  }, []);

  const handleUpdateGroup = useCallback(async (id: string, fields: Partial<ClientGroup>) => {
    const prev = groups;
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...fields } : g)));
    try {
      const res = await fetch(`/api/client-groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Failed to update');
    } catch {
      toast.error('Failed to update group');
      setGroups(prev);
    }
  }, [groups]);

  const handleDropOnKey = useCallback(
    (targetKey: string | null) => {
      const dbId = draggingId;
      setDraggingId(null);
      setDropTargetKey(null);
      if (!dbId) return;
      const client = allClients.find((c) => c.dbId === dbId);
      if (!client) return;
      const nextGroupId = targetKey === 'unassigned' || targetKey === null ? null : targetKey;
      if ((client.groupId ?? null) === nextGroupId) return;
      void handleMoveGroup(dbId, nextGroupId);
    },
    [draggingId, allClients, handleMoveGroup],
  );

  const handleDeleteGroup = useCallback(async (id: string) => {
    const prev = groups;
    const prevClients = allClients;
    setGroups((gs) => gs.filter((g) => g.id !== id));
    setAllClients((xs) => xs.map((c) => (c.groupId === id ? { ...c, groupId: null } : c)));
    try {
      const res = await fetch(`/api/client-groups/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Group deleted');
    } catch {
      toast.error('Failed to delete group');
      setGroups(prev);
      setAllClients(prevClients);
    }
  }, [groups, allClients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? allClients.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          (c.abbreviation && c.abbreviation.toLowerCase().includes(q)) ||
          c.industry.toLowerCase().includes(q) ||
          c.services.some((s) => s.toLowerCase().includes(q)),
        )
      : allClients;

    if (agencyFilter !== 'all') {
      list = list.filter((c) => {
        const b = bucketFor(c.agency);
        return agencyFilter === 'nativz' ? b === 'nativz' : b === 'anderson';
      });
    }

    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [query, agencyFilter, allClients]);

  const active = filtered.filter((c) => c.isActive !== false);
  const inactive = filtered.filter((c) => c.isActive === false);

  // When groups exist, sections are user-defined. Otherwise fall back to
  // hardcoded agency buckets — preserves the earlier UX for admins who
  // haven't created any groups yet.
  const useGroupSections = groups.length > 0;

  const groupSections = useMemo(() => {
    if (!useGroupSections) return [];
    return groups.map((g) => ({
      group: g,
      items: active.filter((c) => c.groupId === g.id),
    }));
  }, [useGroupSections, groups, active]);

  const unassigned = useMemo(() => {
    if (!useGroupSections) return [];
    return active.filter((c) => !c.groupId);
  }, [useGroupSections, active]);

  const agencyBuckets = useMemo(() => {
    if (useGroupSections || agencyFilter !== 'all') return [];
    return BUCKET_ORDER.flatMap((key) => {
      const items = active.filter((c) => bucketFor(c.agency) === key);
      return items.length ? [{ key, items }] : [];
    });
  }, [useGroupSections, active, agencyFilter]);

  const totalShown = filtered.length;
  const totalAll = allClients.length;

  const gridClasses = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3';

  function renderBucket(items: typeof active, dimmed: boolean, indexBase = 0) {
    const commonCardProps = (client: (typeof items)[number], i: number) => ({
      client,
      i: indexBase + i,
      dimmed,
      groups,
      deleting: deletingId === client.dbId,
      draggable: useGroupSections,
      dragging: draggingId === client.dbId,
      onDragStart: (dbId: string) => setDraggingId(dbId),
      onDragEnd: () => { setDraggingId(null); setDropTargetKey(null); },
      onNavigate: () => router.push(`/admin/clients/${client.slug}`),
      onImpersonate: () => client.organizationId && handleImpersonate(client.organizationId, client.slug),
      onRequestDelete: () => client.dbId && setPendingDelete({ dbId: client.dbId, name: client.name }),
      onMoveGroup: (gid: string | null) => client.dbId && handleMoveGroup(client.dbId, gid),
    });
    if (listView) {
      return (
        <div className="space-y-1">
          {items.map((client, i) => (
            <ClientCard key={client.slug} listView {...commonCardProps(client, i)} />
          ))}
        </div>
      );
    }
    return (
      <div className={gridClasses}>
        {items.map((client, i) => (
          <ClientCard key={client.slug} {...commonCardProps(client, i)} />
        ))}
      </div>
    );
  }

  // Drop-zone wrapper for a section. Adds HTML5 dnd handlers + a subtle
  // ring highlight while hovering. Keyboard users still have the
  // "Move to…" menu on each card.
  function DropZone({
    targetKey,
    empty,
    children,
  }: {
    targetKey: string;
    empty?: boolean;
    children: React.ReactNode;
  }) {
    const isTarget = dropTargetKey === targetKey && draggingId !== null;
    return (
      <div
        onDragOver={(e) => {
          if (!draggingId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dropTargetKey !== targetKey) setDropTargetKey(targetKey);
        }}
        onDragLeave={(e) => {
          // Only clear if leaving to outside this element.
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          if (dropTargetKey === targetKey) setDropTargetKey(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDropOnKey(targetKey);
        }}
        className={`rounded-[12px] transition-all duration-150 ${
          isTarget
            ? 'ring-2 ring-accent-border/70 ring-offset-2 ring-offset-background bg-accent-surface/10'
            : ''
        } ${empty && draggingId ? 'min-h-[80px] border border-dashed border-nativz-border/60 p-3' : ''}`}
      >
        {children}
      </div>
    );
  }

  const filtering = query.trim().length > 0 || agencyFilter !== 'all';

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients..."
            className="w-full rounded-lg border border-nativz-border bg-surface-primary pl-9 pr-12 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border transition-colors"
            aria-label="Search clients"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-nativz-border/70 bg-surface px-1.5 py-0.5 text-[10px] font-mono text-text-muted pointer-events-none">
            /
          </kbd>
        </div>

        <select
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value as AgencyFilter)}
          className="rounded-lg border border-nativz-border bg-surface-primary pl-3 pr-8 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer"
          aria-label="Filter by agency"
        >
          <option value="all">All agencies</option>
          <option value="nativz">Nativz</option>
          <option value="ac">Anderson Collaborative</option>
        </select>

        <button
          type="button"
          onClick={() => setShowNewGroup(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="Create new pipeline group"
        >
          <FolderPlus size={14} />
          New group
        </button>

        <div className="flex rounded-lg border border-nativz-border overflow-hidden">
          <button
            type="button"
            onClick={() => setListView(false)}
            className={`p-2 transition-colors ${!listView ? 'bg-accent-surface text-accent-text' : 'bg-surface-primary text-text-muted hover:text-text-secondary'}`}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={!listView}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            type="button"
            onClick={() => setListView(true)}
            className={`p-2 transition-colors ${listView ? 'bg-accent-surface text-accent-text' : 'bg-surface-primary text-text-muted hover:text-text-secondary'}`}
            title="List view"
            aria-label="List view"
            aria-pressed={listView}
          >
            <List size={14} />
          </button>
        </div>

        {filtering && (
          <p className="text-[11px] text-text-muted tabular-nums ml-auto">
            Showing <span className="text-text-secondary">{totalShown}</span> of {totalAll}
          </p>
        )}
      </div>

      {showNewGroup && (
        <NewGroupForm onCreate={handleCreateGroup} onCancel={() => setShowNewGroup(false)} />
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-[10px] border border-dashed border-nativz-border/60">
          <Search size={28} className="text-text-muted/60 mb-3" />
          <p className="text-sm text-text-secondary">No clients match your filters</p>
          <p className="text-xs text-text-muted mt-1">Try clearing the search or switching agencies.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {useGroupSections ? (
            <>
              {groupSections.map((gs, gi) => {
                const offset = groupSections.slice(0, gi).reduce((n, x) => n + x.items.length, 0);
                return (
                  <section key={gs.group.id} className="space-y-2">
                    <GroupSectionHeader
                      group={gs.group}
                      count={gs.items.length}
                      onRename={(name) => handleUpdateGroup(gs.group.id, { name })}
                      onRecolor={(color) => handleUpdateGroup(gs.group.id, { color })}
                      onDelete={() => setPendingGroupDelete({
                        id: gs.group.id,
                        name: gs.group.name,
                        memberCount: gs.items.length,
                      })}
                    />
                    <DropZone targetKey={gs.group.id} empty={gs.items.length === 0}>
                      {gs.items.length > 0 ? (
                        renderBucket(gs.items, false, offset)
                      ) : (
                        <p className="text-[13px] text-text-muted italic pl-2">
                          {draggingId ? 'Drop here to move into this group.' : 'Empty — drag a card here or use the arrow button.'}
                        </p>
                      )}
                    </DropZone>
                  </section>
                );
              })}
              <section className="space-y-2">
                <SectionHeader label="Unassigned" count={unassigned.length} />
                <DropZone targetKey="unassigned" empty={unassigned.length === 0}>
                  {unassigned.length > 0 ? (
                    renderBucket(unassigned, false)
                  ) : (
                    <p className="text-[13px] text-text-muted italic pl-2">
                      {draggingId ? 'Drop here to remove from a group.' : 'No unassigned clients.'}
                    </p>
                  )}
                </DropZone>
              </section>
            </>
          ) : agencyBuckets.length > 0 ? (
            agencyBuckets.map((g, gi) => {
              const offset = agencyBuckets.slice(0, gi).reduce((n, x) => n + x.items.length, 0);
              return (
                <section key={g.key} className="space-y-2">
                  <SectionHeader label={BUCKET_LABEL[g.key]} count={g.items.length} />
                  {renderBucket(g.items, false, offset)}
                </section>
              );
            })
          ) : active.length > 0 ? (
            renderBucket(active, false)
          ) : null}

          {inactive.length > 0 && (
            <section className="space-y-2">
              <SectionHeader
                label="Inactive"
                count={inactive.length}
                icon={<UserX size={12} className="text-text-muted" />}
              />
              {renderBucket(inactive, true)}
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete client"
        description={pendingDelete ? `Delete "${pendingDelete.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete.dbId);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingGroupDelete !== null}
        title="Delete group"
        description={
          pendingGroupDelete
            ? pendingGroupDelete.memberCount > 0
              ? `Delete "${pendingGroupDelete.name}"? Its ${pendingGroupDelete.memberCount} ${pendingGroupDelete.memberCount === 1 ? 'client' : 'clients'} will become unassigned.`
              : `Delete "${pendingGroupDelete.name}"?`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (pendingGroupDelete) void handleDeleteGroup(pendingGroupDelete.id);
          setPendingGroupDelete(null);
        }}
        onCancel={() => setPendingGroupDelete(null)}
      />
    </div>
  );
}
