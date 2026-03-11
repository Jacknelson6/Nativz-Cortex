'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Building2, Search, UserX, LayoutGrid, List, ArrowUpDown, Trash2, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { HealthBadge } from '@/components/clients/health-badge';
import { AgencyBadge } from '@/components/clients/agency-badge';
import { ClientProfileForm } from '@/components/clients/client-profile-form';
import type { ClientProfileFormProps } from '@/components/clients/client-profile-form';
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
}

const STANDARD_SERVICES = ['SMM', 'Paid Media', 'Affiliates', 'Editing'] as const;

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

// ─── Spotlight card (Bedrock pattern) ──────────────────────────────────────────

function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(4, 107, 210, 0.15)',
}: {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(0.6)}
      onMouseLeave={() => setOpacity(0)}
      className={`relative overflow-hidden ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-in-out"
        style={{
          opacity,
          background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
}

// ─── Client card ───────────────────────────────────────────────────────────────

function ClientCard({
  client,
  i,
  dimmed,
  listView,
  onDelete,
  deleting,
  onClick,
}: {
  client: ClientItem;
  i: number;
  dimmed?: boolean;
  listView?: boolean;
  onDelete: (dbId: string) => void;
  deleting?: boolean;
  onClick: () => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm({
    title: 'Delete client',
    description: `Delete "${client.name}"? This cannot be undone.`,
    confirmLabel: 'Delete',
    variant: 'danger',
  });

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!client.dbId) return;
    const ok = await confirm();
    if (!ok) return;
    onDelete(client.dbId);
  }

  const deleteButton = client.dbId && (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
      title={`Delete ${client.name}`}
    >
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );

  if (listView) {
    return (
      <>
        <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} className="group w-full text-left cursor-pointer">
          <div
            className={`flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors animate-stagger-in ${dimmed ? 'opacity-50 hover:opacity-80' : ''}`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            {client.logoUrl ? (
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-surface-hover/50 flex items-center justify-center">
                <img src={client.logoUrl} alt={client.name} className="h-full w-full object-contain p-0.5" />
              </div>
            ) : (
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${dimmed ? 'bg-surface-hover text-text-muted' : 'bg-accent-surface text-accent-text'}`}>
                {client.abbreviation || <Building2 size={16} />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
                {client.abbreviation && <span className="shrink-0 text-[10px] font-medium text-text-muted">{client.abbreviation}</span>}
              </div>
            </div>
            <span className="text-xs text-text-muted shrink-0 hidden sm:block">{client.industry || 'General'}</span>
            <AgencyBadge agency={client.agency} className="shrink-0 hidden md:inline-flex" />
            {client.lastActivityAt && (
              <span className="text-xs text-text-muted shrink-0 hidden lg:block">{formatRelativeTime(client.lastActivityAt)}</span>
            )}
            {client.services.length > 0 && (
              <div className="flex gap-1 shrink-0 hidden xl:flex">
                {client.services.map((s) => <Badge key={s} className="text-[10px] px-1.5 py-0">{s}</Badge>)}
              </div>
            )}
            <HealthBadge healthScore={client.healthScore} />
            {deleteButton}
          </div>
        </div>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} className="group w-full text-left cursor-pointer">
        <SpotlightCard
          className={`rounded-xl border border-nativz-border bg-surface p-4 animate-stagger-in transition-[border-color] duration-200 hover:border-accent-border/40 ${dimmed ? 'opacity-50 hover:opacity-80' : ''}`}
          spotlightColor={dimmed ? 'rgba(100, 100, 120, 0.1)' : 'rgba(4, 107, 210, 0.12)'}
        >
          <div className="relative flex items-start gap-3">
            {client.logoUrl ? (
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-hover/50 flex items-center justify-center">
                <img src={client.logoUrl} alt={client.name} className="h-full w-full object-contain p-1" />
              </div>
            ) : (
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${dimmed ? 'bg-surface-hover text-text-muted' : 'bg-accent-surface text-accent-text'}`}>
                {client.abbreviation || <Building2 size={20} />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
                {client.abbreviation && <span className="shrink-0 text-[10px] font-medium text-text-muted">{client.abbreviation}</span>}
                <HealthBadge healthScore={client.healthScore} className="ml-auto" />
              </div>
              <p className="text-xs text-text-muted">{client.industry || 'General'}</p>
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                <AgencyBadge agency={client.agency} />
                {client.services.map((s) => <Badge key={s} className="text-[10px] px-1.5 py-0">{s}</Badge>)}
              </div>
              {client.lastActivityAt && (
                <p className="text-[10px] text-text-muted mt-1">Active {formatRelativeTime(client.lastActivityAt)}</p>
              )}
            </div>
            <div className="absolute -top-1 -right-1">
              {deleteButton}
            </div>
          </div>
        </SpotlightCard>
      </div>
      {confirmDialog}
    </>
  );
}

// ─── Client detail modal ────────────────────────────────────────────────────────

function ClientDetailModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [data, setData] = useState<ClientProfileFormProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/clients/${slug}`);
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Failed to load client');
        }
        const d = await res.json();
        setData(d);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Centered modal */}
      <div
        ref={panelRef}
        className="relative w-full max-w-5xl max-h-[90vh] bg-background rounded-2xl border border-nativz-border overflow-y-auto animate-[modalScaleIn_200ms_ease-out]"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="sticky top-4 right-4 z-10 float-right mr-4 mt-4 rounded-lg p-2 bg-surface-hover/80 backdrop-blur text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={24} className="animate-spin text-accent-text" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-64 text-sm text-red-400">
            {error}
          </div>
        )}

        {data && (
          <ClientProfileForm
            client={data.client}
            portalContacts={data.portalContacts}
            strategy={data.strategy}
            searches={data.searches}
            recentShoots={data.recentShoots}
            recentMoodboards={data.recentMoodboards}
            ideas={data.ideas}
            ideaCount={data.ideaCount}
            inModal
          />
        )}
      </div>
    </div>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'health';
type AgencyFilter = 'all' | 'nativz' | 'ac';

export function ClientSearchGrid({ clients: rawClients }: { clients: ClientItem[] }) {
  const [allClients, setAllClients] = useState(() =>
    rawClients.map((c) => ({ ...c, services: normalizeServices(c.services) })),
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('health');
  const [agencyFilter, setAgencyFilter] = useState<AgencyFilter>('all');
  const [listView, setListView] = useState(false);

  async function handleDelete(dbId: string) {
    setDeletingId(dbId);
    try {
      const res = await fetch(`/api/clients/${dbId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to delete');
      }
      setAllClients((prev) => prev.filter((c) => c.dbId !== dbId));
      toast.success('Client deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete client');
    } finally {
      setDeletingId(null);
    }
  }

  let filtered = query.trim()
    ? allClients.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.abbreviation && c.abbreviation.toLowerCase().includes(q)) ||
          c.industry.toLowerCase().includes(q) ||
          c.services.some((s) => s.toLowerCase().includes(q))
        );
      })
    : allClients;

  // Agency filter
  if (agencyFilter !== 'all') {
    filtered = filtered.filter((c) => {
      const a = (c.agency || '').toLowerCase();
      if (agencyFilter === 'nativz') return a.includes('nativz');
      if (agencyFilter === 'ac') return a.includes('anderson');
      return true;
    });
  }

  // Sort
  const HEALTH_RANK: Record<string, number> = { excellent: 5, great: 4, good: 3, fair: 2, not_good: 1 };
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'health') {
      const ra = a.healthScore ? (HEALTH_RANK[a.healthScore] ?? 0) : 0;
      const rb = b.healthScore ? (HEALTH_RANK[b.healthScore] ?? 0) : 0;
      return rb - ra;
    }
    return a.name.localeCompare(b.name);
  });

  const active = sorted.filter((c) => c.isActive !== false);
  const inactive = sorted.filter((c) => c.isActive === false);

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients..."
            className="w-full rounded-lg border border-nativz-border bg-surface-primary pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border transition-colors"
          />
        </div>

        {/* Agency filter */}
        <select
          value={agencyFilter}
          onChange={(e) => setAgencyFilter(e.target.value as AgencyFilter)}
          className="rounded-lg border border-nativz-border bg-surface-primary pl-3 pr-8 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer appearance-auto"
        >
          <option value="all">All agencies</option>
          <option value="nativz">Nativz</option>
          <option value="ac">Anderson Collaborative</option>
        </select>

        {/* Sort */}
        <button
          onClick={() => setSortBy((s) => (s === 'health' ? 'name' : 'health'))}
          className="flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          title={`Sort by ${sortBy === 'health' ? 'name' : 'health score'}`}
        >
          <ArrowUpDown size={14} />
          {sortBy === 'health' ? 'Health' : 'Name'}
        </button>

        {/* View toggle */}
        <div className="flex rounded-lg border border-nativz-border overflow-hidden">
          <button
            onClick={() => setListView(false)}
            className={`p-2 transition-colors ${!listView ? 'bg-accent-surface text-accent-text' : 'bg-surface-primary text-text-muted hover:text-text-secondary'}`}
            title="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setListView(true)}
            className={`p-2 transition-colors ${listView ? 'bg-accent-surface text-accent-text' : 'bg-surface-primary text-text-muted hover:text-text-secondary'}`}
            title="List view"
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search size={24} className="text-text-muted mb-2" />
          <p className="text-sm text-text-muted">No clients match your filters</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            listView ? (
              <div className="space-y-1">
                {active.map((client, i) => (
                  <ClientCard key={client.slug} client={client} i={i} listView onDelete={handleDelete} deleting={deletingId === client.dbId} onClick={() => setSelectedSlug(client.slug)} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((client, i) => (
                  <ClientCard key={client.slug} client={client} i={i} onDelete={handleDelete} deleting={deletingId === client.dbId} onClick={() => setSelectedSlug(client.slug)} />
                ))}
              </div>
            )
          )}

          {inactive.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-text-muted">
                <UserX size={14} />
                <p className="text-xs font-medium uppercase tracking-wide">Inactive ({inactive.length})</p>
              </div>
              {listView ? (
                <div className="space-y-1">
                  {inactive.map((client, i) => (
                    <ClientCard key={client.slug} client={client} i={i} dimmed listView onDelete={handleDelete} deleting={deletingId === client.dbId} onClick={() => setSelectedSlug(client.slug)} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {inactive.map((client, i) => (
                    <ClientCard key={client.slug} client={client} i={i} dimmed onDelete={handleDelete} deleting={deletingId === client.dbId} onClick={() => setSelectedSlug(client.slug)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Client detail slide-over */}
      {selectedSlug && (
        <ClientDetailModal slug={selectedSlug} onClose={() => setSelectedSlug(null)} />
      )}
    </>
  );
}
