'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, UserX, LayoutGrid, List, Trash2, Loader2, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { HealthBadge } from '@/components/clients/health-badge';
import { AgencyBadge } from '@/components/clients/agency-badge';
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

  function handleImpersonate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!client.organizationId) return;
    fetch('/api/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: client.organizationId, client_slug: client.slug }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => { window.location.href = data.redirect; })
      .catch(() => toast.error('Failed to impersonate'));
  }

  const actionButtons = (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {client.organizationId && (
        <button
          onClick={handleImpersonate}
          className="rounded-md p-1.5 text-text-muted hover:text-accent-text hover:bg-accent-surface/20 cursor-pointer"
          title={`View as ${client.name}`}
        >
          <Eye size={14} />
        </button>
      )}
      {client.dbId && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
          title={`Delete ${client.name}`}
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      )}
    </div>
  );

  if (listView) {
    return (
      <>
        <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} className="group w-full text-left cursor-pointer">
          <div
            className={`flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors animate-stagger-in ${dimmed ? 'opacity-50 hover:opacity-80' : ''}`}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <ClientLogo src={client.logoUrl} name={client.name} abbreviation={client.abbreviation} size="sm" />
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
            {actionButtons}
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
            <ClientLogo src={client.logoUrl} name={client.name} abbreviation={client.abbreviation} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
                {client.abbreviation && <span className="shrink-0 text-[10px] font-medium text-text-muted">{client.abbreviation}</span>}
                <HealthBadge healthScore={client.healthScore} className="ml-auto" />
              </div>
              <p className="text-xs text-text-muted">{client.industry || 'General'}</p>
              <div className="mt-1.5 space-y-1">
                <AgencyBadge agency={client.agency} />
                <div className="flex items-center gap-1">
                  {client.services.map((s) => <Badge key={s} className="text-[10px] px-1.5 py-0 shrink-0">{s}</Badge>)}
                </div>
              </div>
              {client.lastActivityAt && (
                <p className="text-[10px] text-text-muted mt-1">Active {formatRelativeTime(client.lastActivityAt)}</p>
              )}
            </div>
            <div className="absolute -top-1 -right-1">
              {actionButtons}
            </div>
          </div>
        </SpotlightCard>
      </div>
      {confirmDialog}
    </>
  );
}

// ─── Grid ──────────────────────────────────────────────────────────────────────

type AgencyFilter = 'all' | 'nativz' | 'ac';

export function ClientSearchGrid({ clients: rawClients }: { clients: ClientItem[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [allClients, setAllClients] = useState(() =>
    rawClients.map((c) => ({ ...c, services: normalizeServices(c.services) })),
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const legacyClientParam = searchParams.get('client');
  useEffect(() => {
    if (!legacyClientParam) return;
    router.replace(`/admin/clients/${encodeURIComponent(legacyClientParam)}`);
  }, [legacyClientParam, router]);

  const [query, setQuery] = useState('');
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

  // Sort alphabetically
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

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
                  <ClientCard key={client.slug} client={client} i={i} listView onDelete={handleDelete} deleting={deletingId === client.dbId} onClick={() => router.push(`/admin/clients/${client.slug}`)} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {active.map((client, i) => (
                  <ClientCard key={client.slug} client={client} i={i} onDelete={handleDelete} deleting={deletingId === client.dbId} onClick={() => router.push(`/admin/clients/${client.slug}`)} />
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
                    <ClientCard key={client.slug} client={client} i={i} dimmed listView onDelete={handleDelete} deleting={deletingId === client.dbId} onClick={() => router.push(`/admin/clients/${client.slug}`)} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {inactive.map((client, i) => (
                    <ClientCard key={client.slug} client={client} i={i} dimmed onDelete={handleDelete} deleting={deletingId === client.dbId} onClick={() => router.push(`/admin/clients/${client.slug}`)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </>
  );
}
