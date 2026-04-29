'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  UserX,
  LayoutGrid,
  List,
  MoreHorizontal,
  Check,
  ArrowRight,
} from 'lucide-react';
// (SpotlightCard — the cursor-following cyan radial hover glow — was removed
// 2026-04-24: looked stuck-blue on AC paper and wasn't needed to signal
// hoverability. The border + bg transitions on the card itself carry that load.)
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HealthBadge } from '@/components/clients/health-badge';
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
  /** Derived server-side — true if the client has an active or paused onboarding tracker. */
  inOnboarding?: boolean;
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

// 'purple' key retained for backwards-compat with any clients already
// tagged that color — renders as fuchsia now, no data migration needed.
type ColorKey = 'cyan' | 'fuchsia' | 'coral' | 'emerald' | 'amber' | 'rose' | 'teal' | 'slate' | 'purple';

const GROUP_COLORS: { key: ColorKey; label: string; dot: string; soft: string; text: string }[] = [
  { key: 'cyan',    label: 'Cyan',    dot: 'bg-[#00AEEF]',   soft: 'bg-[#00AEEF]/10',   text: 'text-[#5CC8F2]' },
  { key: 'fuchsia', label: 'Fuchsia', dot: 'bg-fuchsia-500', soft: 'bg-fuchsia-500/10', text: 'text-fuchsia-300' },
  { key: 'coral',   label: 'Coral',   dot: 'bg-[#ED6B63]',   soft: 'bg-[#ED6B63]/10',   text: 'text-[#F08A83]' },
  { key: 'emerald', label: 'Emerald', dot: 'bg-emerald-500', soft: 'bg-emerald-500/10', text: 'text-emerald-400' },
  { key: 'amber',   label: 'Amber',   dot: 'bg-amber-500',   soft: 'bg-amber-500/10',   text: 'text-amber-400' },
  { key: 'rose',    label: 'Rose',    dot: 'bg-rose-500',    soft: 'bg-rose-500/10',    text: 'text-rose-400' },
  { key: 'teal',    label: 'Teal',    dot: 'bg-teal-500',    soft: 'bg-teal-500/10',    text: 'text-teal-400' },
  { key: 'slate',   label: 'Slate',   dot: 'bg-slate-500',   soft: 'bg-slate-500/10',   text: 'text-slate-300' },
];

// Legacy: any row tagged `purple` in the DB renders with fuchsia styling
// (the color picker no longer offers Purple). Same entry, swapped styling.
const LEGACY_COLOR_MAP: Record<string, ColorKey> = { purple: 'fuchsia' };

function colorStyles(key: string | undefined) {
  const resolved = key && LEGACY_COLOR_MAP[key] ? LEGACY_COLOR_MAP[key] : key;
  return GROUP_COLORS.find((c) => c.key === resolved) ?? GROUP_COLORS[GROUP_COLORS.length - 1];
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

type AgencyBucket = 'prospect' | 'onboarding' | 'nativz' | 'anderson';

/**
 * Bucket each client into a pipeline row.
 * Onboarding wins over agency — a client with an active tracker is "in flight"
 * regardless of which agency will eventually own them. When the tracker
 * completes, the client naturally falls back into their agency row.
 */
function bucketFor(agency: string | null | undefined, inOnboarding?: boolean): AgencyBucket {
  if (inOnboarding) return 'onboarding';
  const a = (agency ?? '').trim().toLowerCase();
  if (!a) return 'prospect';
  if (a.includes('anderson') || a === 'ac') return 'anderson';
  // Anything else with an agency tag (nativz, internal, misc) folds into Nativz.
  if (a) return 'nativz';
  return 'prospect';
}

const BUCKET_LABEL: Record<AgencyBucket, string> = {
  prospect: 'Prospect',
  onboarding: 'Onboarding',
  nativz: 'Nativz',
  anderson: 'Anderson Collaborative',
};

const BUCKET_ORDER: AgencyBucket[] = ['prospect', 'onboarding', 'nativz', 'anderson'];

/** DB `agency` value to write when a card is dropped on a bucket. `null` clears the field. */
const BUCKET_AGENCY_VALUE: Record<AgencyBucket, string | null> = {
  prospect: null,
  onboarding: null, // read-only; drops here are rejected
  nativz: 'Nativz',
  anderson: 'Anderson Collaborative',
};

// ─── Move menu ─────────────────────────────────────────────────────────────
//
// Single always-visible "Move" control replaces the old HTML5 drag-drop. The
// menu adapts to the current sectioning mode — if the grid is organized by
// user groups, it lists groups + Unassigned; if organized by agency bucket,
// it lists the agency rows (Onboarding is read-only and excluded). Keeps the
// interaction one click deep, which is what Jack asked for.

type MoveMode = 'groups' | 'agency';

function MoveMenu({
  mode,
  groups,
  currentGroupId,
  currentBucket,
  onMoveGroup,
  onMoveAgency,
}: {
  mode: MoveMode;
  groups: ClientGroup[];
  currentGroupId: string | null | undefined;
  currentBucket: AgencyBucket;
  onMoveGroup: (groupId: string | null) => void;
  onMoveAgency: (bucket: AgencyBucket) => void;
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

  // Agency buckets the user can pick — onboarding is tracker-driven, so it
  // never appears as a manual destination.
  const agencyChoices = BUCKET_ORDER.filter((b) => b !== 'onboarding');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1 rounded-md border border-nativz-border/70 bg-surface px-2 py-1 text-[11px] font-medium text-text-secondary hover:border-accent-border/60 hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-colors"
        title="Move to…"
        aria-label="Move client"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowRight size={11} />
        Move
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 min-w-[200px] rounded-lg border border-nativz-border bg-surface shadow-xl animate-[popIn_150ms_ease-out] py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted/70">
            Move to
          </div>
          {mode === 'groups' ? (
            <>
              {groups.map((g) => {
                const s = colorStyles(g.color);
                const active = g.id === currentGroupId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setOpen(false); onMoveGroup(g.id); }}
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
                role="menuitem"
                onClick={() => { setOpen(false); onMoveGroup(null); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover transition-colors text-left"
              >
                <span className="h-2 w-2 rounded-full bg-slate-600" />
                <span className="flex-1">Unassigned</span>
                {!currentGroupId && <Check size={12} className="text-accent-text" />}
              </button>
            </>
          ) : (
            agencyChoices.map((b) => {
              const active = b === currentBucket;
              return (
                <button
                  key={b}
                  type="button"
                  role="menuitem"
                  onClick={() => { setOpen(false); if (!active) onMoveAgency(b); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors text-left"
                >
                  <span className="flex-1 truncate">{BUCKET_LABEL[b]}</span>
                  {active && <Check size={12} className="text-accent-text" />}
                </button>
              );
            })
          )}
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
  moveMode,
  onNavigate,
  onMoveGroup,
  onMoveAgency,
  animate = true,
}: {
  client: ClientItem;
  i: number;
  dimmed?: boolean;
  listView?: boolean;
  groups: ClientGroup[];
  /** Which destinations the Move menu should list — matches the current
   *  sectioning mode so users can only move between rows they can see. */
  moveMode: MoveMode;
  onNavigate: () => void;
  onMoveGroup: (groupId: string | null) => void;
  onMoveAgency: (bucket: AgencyBucket) => void;
  /**
   * When false, skip the entrance stagger animation. We turn this off after
   * the initial mount so cards don't re-animate from scratch on layout shifts.
   */
  animate?: boolean;
}) {
  const staggerDelay = animate ? `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms` : undefined;
  const staggerClass = animate ? 'animate-stagger-in' : '';
  const currentBucket = bucketFor(client.agency, client.inOnboarding);

  // 2026-04-25: dropped the always-visible Eye (Impersonate) and Trash
  // (Delete) icons that used to live at the card's top-right. Both actions
  // now live inside the client detail page's identity header, which is one
  // click away. Move stays — it's the only card-level action that makes
  // sense without leaving the grid.
  const moveButton = client.dbId && (
    <div className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      <MoveMenu
        mode={moveMode}
        groups={groups}
        currentGroupId={client.groupId}
        currentBucket={currentBucket}
        onMoveGroup={onMoveGroup}
        onMoveAgency={onMoveAgency}
      />
    </div>
  );

  const actionButtons = (
    <div className="flex items-center gap-0.5">
      {moveButton}
    </div>
  );

  if (listView) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onNavigate}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(); } }}
        className={`group w-full text-left cursor-pointer focus:outline-none ${staggerClass} transition-[opacity] duration-150`}
        style={staggerDelay ? { animationDelay: staggerDelay } : undefined}
      >
        <div
          className={`flex items-center gap-3 rounded-[10px] border border-nativz-border-light px-4 py-3 hover:bg-surface-hover focus-visible:ring-1 focus-visible:ring-accent-border transition-colors ${dimmed ? 'opacity-60' : ''}`}
        >
          <ClientLogo src={client.logoUrl} name={client.name} abbreviation={client.abbreviation} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary truncate" title={client.name}>{client.name}</p>
            <p className="text-xs text-text-muted truncate">{client.industry || 'General'}</p>
          </div>
          {/* Agency + services pills retired 2026-04-25 — the page already
              groups cards under their agency / status section header, so
              repeating that on every card was redundant noise. */}
          {client.lastActivityAt && (
            <span className="text-xs text-text-muted shrink-0 hidden lg:block tabular-nums">
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
      onClick={onNavigate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(); } }}
      className={`group w-full text-left focus:outline-none ${staggerClass} cursor-pointer transition-[opacity] duration-150`}
      style={staggerDelay ? { animationDelay: staggerDelay } : undefined}
    >
      <div
        className={`rounded-[10px] border border-nativz-border bg-surface p-4 transition-colors duration-200 hover:bg-surface-hover focus-within:ring-1 focus-within:ring-accent-border ${dimmed ? 'opacity-60' : ''}`}
      >
        <div className="relative flex items-start gap-3">
          <ClientLogo src={client.logoUrl} name={client.name} abbreviation={client.abbreviation} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary truncate leading-tight" title={client.name}>{client.name}</p>
                <p className="text-xs text-text-muted truncate mt-0.5">{client.industry || 'General'}</p>
              </div>
              <HealthBadge
                healthScore={client.healthScore}
                className="shrink-0 mt-0.5"
              />
            </div>

            {/* Agency + services pills retired 2026-04-25 — section
                grouping already conveys agency / bucket. Last activity
                stays as the only meta line so the card has a heartbeat. */}
            {client.lastActivityAt && (
              <div className="mt-2.5 flex items-center">
                <span className="ml-auto text-xs text-text-muted tabular-nums">
                  {formatRelativeTime(client.lastActivityAt)}
                </span>
              </div>
            )}
          </div>
          <div className="absolute top-0 right-0">{actionButtons}</div>
        </div>
      </div>
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

// ─── Generic section header (agency fallback + inactive bucket) ────────────

function SectionHeader({
  label,
  count,
  icon,
  labelClassName = 'text-text-muted',
}: {
  label: string;
  count: number;
  icon?: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-1">
      {icon}
      <h2 className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${labelClassName}`}>{label}</h2>
      <span className="text-[12px] text-text-muted/60 tabular-nums">{count}</span>
      <div className="flex-1 h-px bg-nativz-border/40 ml-1" />
    </div>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────

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
  const [pendingGroupDelete, setPendingGroupDelete] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [query, setQuery] = useState('');
  const [listView, setListView] = useState(false);
  // Once the initial stagger has had time to play, turn it off. Otherwise every
  // card would re-animate when a move causes layout to shift.
  const [canAnimateIn, setCanAnimateIn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setCanAnimateIn(false), STAGGER_CAP * STAGGER_MS + 400);
    return () => clearTimeout(t);
  }, []);

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

  // Per-card Impersonate / Delete moved to the client detail page header
  // 2026-04-25 — see components/clients/client-identity-header.tsx.

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

  const handleMoveAgency = useCallback(
    async (client: ClientItem, bucket: AgencyBucket) => {
      const dbId = client.dbId;
      if (!dbId) return;
      if (bucket === 'onboarding') {
        toast.error('Start an onboarding from /admin/onboarding to move a client here.');
        return;
      }

      const targetAgency = BUCKET_AGENCY_VALUE[bucket];
      const wasInOnboarding = client.inOnboarding === true;
      const prevAgency = client.agency;

      // Optimistic: flip agency + clear onboarding flag if we're promoting out.
      setAllClients((xs) =>
        xs.map((c) =>
          c.dbId === dbId
            ? {
                ...c,
                agency: targetAgency ?? undefined,
                inOnboarding: wasInOnboarding ? false : c.inOnboarding,
              }
            : c,
        ),
      );

      try {
        if (wasInOnboarding) {
          const res = await fetch(`/api/clients/${dbId}/promote-onboarding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agency: targetAgency }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          const data = (await res.json()) as { completed_trackers: number };
          toast.success(
            data.completed_trackers > 0
              ? `${client.name} onboarded → ${BUCKET_LABEL[bucket]} (${data.completed_trackers} tracker${data.completed_trackers === 1 ? '' : 's'} completed)`
              : `${client.name} → ${BUCKET_LABEL[bucket]}`,
          );
        } else {
          const res = await fetch(`/api/clients/${dbId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agency: targetAgency }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          toast.success(`${client.name} → ${BUCKET_LABEL[bucket]}`);
        }
      } catch (err) {
        setAllClients((xs) =>
          xs.map((c) =>
            c.dbId === dbId
              ? { ...c, agency: prevAgency, inOnboarding: wasInOnboarding }
              : c,
          ),
        );
        toast.error(`Move failed: ${(err as Error).message}`);
      }
    },
    [],
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
    const list = q
      ? allClients.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          (c.abbreviation && c.abbreviation.toLowerCase().includes(q)) ||
          c.industry.toLowerCase().includes(q) ||
          c.services.some((s) => s.toLowerCase().includes(q)),
        )
      : allClients;

    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [query, allClients]);

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
    if (useGroupSections) return [];
    // Include every bucket (even empty ones) so every row is a visible drop
    // target. Prospect and Onboarding especially need to be there at zero-count
    // so new cards have somewhere to land.
    return BUCKET_ORDER.map((key) => ({
      key,
      items: active.filter((c) => bucketFor(c.agency, c.inOnboarding) === key),
    }));
  }, [useGroupSections, active]);

  const totalShown = filtered.length;
  const totalAll = allClients.length;

  const gridClasses = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3';

  // Menu mode follows sectioning: if user groups exist, the Move menu lists
  // groups; otherwise it lists agency buckets. Keeps destinations matched to
  // what the user is currently seeing on screen.
  const moveMode: MoveMode = useGroupSections ? 'groups' : 'agency';

  function renderBucket(items: typeof active, dimmed: boolean, indexBase = 0) {
    const commonCardProps = (client: (typeof items)[number], i: number) => ({
      client,
      i: indexBase + i,
      dimmed,
      groups,
      moveMode,
      animate: canAnimateIn,
      onNavigate: () => router.push(`/admin/clients/${client.slug}`),
      onMoveGroup: (gid: string | null) => client.dbId && handleMoveGroup(client.dbId, gid),
      onMoveAgency: (bucket: AgencyBucket) => handleMoveAgency(client, bucket),
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

  const filtering = query.trim().length > 0;

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
                    {gs.items.length > 0 ? (
                      renderBucket(gs.items, false, offset)
                    ) : (
                      <p className="text-[13px] text-text-muted italic pl-2">
                        Empty — use the Move button on any card to add one here.
                      </p>
                    )}
                  </section>
                );
              })}
              <section className="space-y-2">
                <SectionHeader label="Unassigned" count={unassigned.length} />
                {unassigned.length > 0 ? (
                  renderBucket(unassigned, false)
                ) : (
                  <p className="text-[13px] text-text-muted italic pl-2">
                    No unassigned clients.
                  </p>
                )}
              </section>
            </>
          ) : agencyBuckets.length > 0 ? (
            agencyBuckets.map((g, gi) => {
              const offset = agencyBuckets.slice(0, gi).reduce((n, x) => n + x.items.length, 0);
              const readOnly = g.key === 'onboarding';
              const labelClassName =
                g.key === 'onboarding' ? 'text-amber-400'
                : g.key === 'nativz' ? 'text-[#00AEEF]'
                : g.key === 'anderson' ? 'text-[#36D1C2]'
                : undefined;
              const emptyMessage = readOnly
                ? 'Start an onboarding from the Onboarding page.'
                : 'No clients in this row yet.';
              return (
                <section key={g.key} className="space-y-2">
                  <SectionHeader
                    label={BUCKET_LABEL[g.key]}
                    count={g.items.length}
                    labelClassName={labelClassName}
                  />
                  {g.items.length > 0 ? (
                    renderBucket(g.items, false, offset)
                  ) : (
                    <p className="text-[13px] text-text-muted italic pl-2">{emptyMessage}</p>
                  )}
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
