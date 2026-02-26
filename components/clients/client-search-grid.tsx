'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Search, UserX, LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HealthBadge } from '@/components/clients/health-badge';
import { AgencyBadge } from '@/components/clients/agency-badge';
import { formatRelativeTime } from '@/lib/utils/format';

interface ClientItem {
  name: string;
  slug: string;
  abbreviation?: string;
  industry: string;
  services: string[];
  agency?: string;
  isActive?: boolean;
  logoUrl?: string | null;
  healthScore?: number;
  healthIsNew?: boolean;
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

function ClientCard({ client, i, dimmed, listView }: { client: ClientItem; i: number; dimmed?: boolean; listView?: boolean }) {
  if (listView) {
    return (
      <Link href={`/admin/clients/${client.slug}`}>
        <div className={`flex items-center gap-3 rounded-lg border border-nativz-border-light px-4 py-3 hover:bg-surface-hover transition-colors animate-stagger-in ${dimmed ? 'opacity-50 hover:opacity-80' : ''}`} style={{ animationDelay: `${i * 30}ms` }}>
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
          {typeof client.healthScore === 'number' && <HealthBadge score={client.healthScore} isNew={client.healthIsNew} />}
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/admin/clients/${client.slug}`}>
      <Card interactive className={`animate-stagger-in flex items-start gap-3 ${dimmed ? 'opacity-50 hover:opacity-80' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
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
            {typeof client.healthScore === 'number' && <HealthBadge score={client.healthScore} isNew={client.healthIsNew} className="ml-auto" />}
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
      </Card>
    </Link>
  );
}

type SortKey = 'name' | 'health';
type AgencyFilter = 'all' | 'nativz' | 'ac';

export function ClientSearchGrid({ clients: rawClients }: { clients: ClientItem[] }) {
  const clients = rawClients.map((c) => ({ ...c, services: normalizeServices(c.services) }));

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('health');
  const [agencyFilter, setAgencyFilter] = useState<AgencyFilter>('all');
  const [listView, setListView] = useState(false);

  let filtered = query.trim()
    ? clients.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.abbreviation && c.abbreviation.toLowerCase().includes(q)) ||
          c.industry.toLowerCase().includes(q) ||
          c.services.some((s) => s.toLowerCase().includes(q))
        );
      })
    : clients;

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
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'health') return (b.healthScore ?? 0) - (a.healthScore ?? 0);
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
                  <ClientCard key={client.slug} client={client} i={i} listView />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((client, i) => (
                  <ClientCard key={client.slug} client={client} i={i} />
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
                    <ClientCard key={client.slug} client={client} i={i} dimmed listView />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {inactive.map((client, i) => (
                    <ClientCard key={client.slug} client={client} i={i} dimmed />
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
