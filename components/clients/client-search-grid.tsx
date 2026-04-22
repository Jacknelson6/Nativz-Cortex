'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, UserX, LayoutGrid, List, Trash2, Loader2, Eye } from 'lucide-react';
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
}

const STANDARD_SERVICES = ['SMM', 'Paid Media', 'Affiliates', 'Editing'] as const;
const STAGGER_CAP = 12;
const STAGGER_MS = 28;

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

  // Nativz cyan for active cards; neutral for inactive/dimmed.
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

// ─── Client card ───────────────────────────────────────────────────────────

function ClientCard({
  client,
  i,
  dimmed,
  listView,
  onNavigate,
  onImpersonate,
  onRequestDelete,
  deleting,
}: {
  client: ClientItem;
  i: number;
  dimmed?: boolean;
  listView?: boolean;
  onNavigate: () => void;
  onImpersonate: () => void;
  onRequestDelete: () => void;
  deleting?: boolean;
}) {
  const staggerDelay = `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms`;

  const actionButtons = (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
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
        onClick={onNavigate}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(); } }}
        className={`group w-full text-left cursor-pointer focus:outline-none animate-stagger-in ${deleting ? 'pointer-events-none opacity-50' : ''}`}
        style={{ animationDelay: staggerDelay }}
      >
        <div
          className={`flex items-center gap-3 rounded-[10px] border border-nativz-border-light px-4 py-2.5 hover:bg-surface-hover focus-visible:ring-1 focus-visible:ring-accent-border transition-colors ${dimmed ? 'opacity-55 hover:opacity-80' : ''}`}
        >
          <ClientLogo src={client.logoUrl} name={client.name} abbreviation={client.abbreviation} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-text-primary truncate" title={client.name}>{client.name}</p>
              {client.abbreviation && <span className="shrink-0 text-[10px] font-medium text-text-muted">{client.abbreviation}</span>}
            </div>
            <p className="text-[11px] text-text-muted truncate">{client.industry || 'General'}</p>
          </div>
          <AgencyAssignmentLabel agency={client.agency} showWhenUnassigned className="shrink-0 hidden sm:block" />
          {client.services.length > 0 && (
            <div className="hidden md:flex gap-1 shrink-0">
              {client.services.map((s) => <Badge key={s} className="text-[10px] px-1.5 py-0">{s}</Badge>)}
            </div>
          )}
          {client.lastActivityAt && (
            <span className="text-[11px] text-text-muted shrink-0 hidden lg:block tabular-nums">
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
      className={`group w-full text-left cursor-pointer focus:outline-none animate-stagger-in ${deleting ? 'pointer-events-none opacity-50' : ''}`}
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
                  <p className="text-sm font-medium text-text-primary truncate" title={client.name}>{client.name}</p>
                  {client.abbreviation && <span className="shrink-0 text-[10px] font-medium text-text-muted">{client.abbreviation}</span>}
                </div>
                <p className="text-xs text-text-muted truncate">{client.industry || 'General'}</p>
              </div>
              <HealthBadge
                healthScore={client.healthScore}
                className="shrink-0 mt-0.5 transition-opacity duration-200 group-hover:opacity-0 group-focus-within:opacity-0"
              />
            </div>

            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <AgencyAssignmentLabel agency={client.agency} showWhenUnassigned />
              {client.services.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {client.services.map((s) => <Badge key={s} className="text-[10px] px-1.5 py-0 shrink-0">{s}</Badge>)}
                </div>
              )}
              {client.lastActivityAt && (
                <span className="ml-auto text-[10px] text-text-muted tabular-nums">
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

// ─── Section header ────────────────────────────────────────────────────────

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
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</h2>
      <span className="text-[11px] text-text-muted/60 tabular-nums">{count}</span>
      <div className="flex-1 h-px bg-nativz-border/40 ml-1" />
    </div>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────

type AgencyFilter = 'all' | 'nativz' | 'ac';

export function ClientSearchGrid({ clients: rawClients }: { clients: ClientItem[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  const [allClients, setAllClients] = useState(() =>
    rawClients.map((c) => ({ ...c, services: normalizeServices(c.services) })),
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ dbId: string; name: string } | null>(null);
  const [query, setQuery] = useState('');
  const [agencyFilter, setAgencyFilter] = useState<AgencyFilter>('all');
  const [listView, setListView] = useState(false);

  const legacyClientParam = searchParams.get('client');
  useEffect(() => {
    if (!legacyClientParam) return;
    router.replace(`/admin/clients/${encodeURIComponent(legacyClientParam)}`);
  }, [legacyClientParam, router]);

  // "/" focuses search — cockpit keyboard shortcut.
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

  const groups = useMemo(() => {
    if (agencyFilter !== 'all') return [] as { key: AgencyBucket; items: typeof active }[];
    return BUCKET_ORDER.flatMap((key) => {
      const items = active.filter((c) => bucketFor(c.agency) === key);
      return items.length ? [{ key, items }] : [];
    });
  }, [active, agencyFilter]);

  const totalShown = filtered.length;
  const totalAll = allClients.length;

  const gridClasses = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3';

  function renderBucket(items: typeof active, dimmed: boolean, indexBase = 0) {
    if (listView) {
      return (
        <div className="space-y-1">
          {items.map((client, i) => (
            <ClientCard
              key={client.slug}
              client={client}
              i={indexBase + i}
              dimmed={dimmed}
              listView
              deleting={deletingId === client.dbId}
              onNavigate={() => router.push(`/admin/clients/${client.slug}`)}
              onImpersonate={() => client.organizationId && handleImpersonate(client.organizationId, client.slug)}
              onRequestDelete={() => client.dbId && setPendingDelete({ dbId: client.dbId, name: client.name })}
            />
          ))}
        </div>
      );
    }
    return (
      <div className={gridClasses}>
        {items.map((client, i) => (
          <ClientCard
            key={client.slug}
            client={client}
            i={indexBase + i}
            dimmed={dimmed}
            deleting={deletingId === client.dbId}
            onNavigate={() => router.push(`/admin/clients/${client.slug}`)}
            onImpersonate={() => client.organizationId && handleImpersonate(client.organizationId, client.slug)}
            onRequestDelete={() => client.dbId && setPendingDelete({ dbId: client.dbId, name: client.name })}
          />
        ))}
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
          {groups.length > 0
            ? groups.map((g, gi) => {
                const offset = groups.slice(0, gi).reduce((n, x) => n + x.items.length, 0);
                return (
                  <section key={g.key} className="space-y-2">
                    <SectionHeader label={BUCKET_LABEL[g.key]} count={g.items.length} />
                    {renderBucket(g.items, false, offset)}
                  </section>
                );
              })
            : active.length > 0
              ? renderBucket(active, false)
              : null}

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
    </div>
  );
}
