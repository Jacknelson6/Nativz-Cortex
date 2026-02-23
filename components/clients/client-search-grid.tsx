'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Search, UserX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ClientItem {
  name: string;
  slug: string;
  abbreviation?: string;
  industry: string;
  services: string[];
  isActive?: boolean;
}

const STANDARD_SERVICES = ['SMM', 'Paid Media', 'Affiliates', 'Editing'] as const;

/** Map verbose/non-standard service names to the standard Monday set. */
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

function ClientCard({
  client,
  i,
  dimmed,
}: {
  client: ClientItem;
  i: number;
  dimmed?: boolean;
}) {
  return (
    <Link key={client.slug} href={`/admin/clients/${client.slug}`}>
      <Card interactive className={`animate-stagger-in flex items-start gap-3 ${dimmed ? 'opacity-50 hover:opacity-80' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${dimmed ? 'bg-surface-hover text-text-muted' : 'bg-accent-surface text-accent-text'}`}>
          {client.abbreviation || <Building2 size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
          <p className="text-xs text-text-muted">{client.industry || 'General'}</p>
          {client.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {client.services.map((service) => (
                <Badge key={service} className="text-[10px] px-1.5 py-0">
                  {service}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

export function ClientSearchGrid({ clients: rawClients }: { clients: ClientItem[] }) {
  const clients = rawClients.map((c) => ({
    ...c,
    services: normalizeServices(c.services),
  }));

  const [query, setQuery] = useState('');

  const filtered = query.trim()
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

  const active = filtered.filter((c) => c.isActive !== false);
  const inactive = filtered.filter((c) => c.isActive === false);

  return (
    <>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients..."
          className="w-full rounded-lg border border-nativz-border bg-surface-primary pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search size={24} className="text-text-muted mb-2" />
          <p className="text-sm text-text-muted">No clients match &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((client, i) => (
                <ClientCard key={client.slug} client={client} i={i} />
              ))}
            </div>
          )}

          {inactive.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-text-muted">
                <UserX size={14} />
                <p className="text-xs font-medium uppercase tracking-wide">Inactive ({inactive.length})</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {inactive.map((client, i) => (
                  <ClientCard key={client.slug} client={client} i={i} dimmed />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
