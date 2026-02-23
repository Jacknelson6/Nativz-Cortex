'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Search, UserX, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ClientItem {
  name: string;
  slug: string;
  abbreviation?: string;
  industry: string;
  services: string[];
}

const STANDARD_SERVICES = ['SMM', 'Paid Media', 'Affiliates', 'Editing'] as const;

const serviceColors: Record<string, 'info' | 'purple' | 'success' | 'warning' | 'danger'> = {
  SMM: 'info',
  'Paid Media': 'purple',
  Editing: 'success',
  Affiliates: 'warning',
};

function getServiceVariant(service: string) {
  return serviceColors[service] || 'default' as const;
}

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
    // Drop non-standard services like "SEO / Blog Content" that don't map
  }
  // Return in standard order
  return STANDARD_SERVICES.filter((s) => result.has(s));
}

function ClientCard({
  client,
  i,
  dimmed,
  onRemove,
}: {
  client: ClientItem;
  i: number;
  dimmed?: boolean;
  onRemove: (slug: string) => void;
}) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Remove ${client.name} from the clients board?`)) return;

    setRemoving(true);
    try {
      // Look up the DB client ID by slug
      const lookupRes = await fetch(`/api/clients?slug=${encodeURIComponent(client.slug)}`);
      if (!lookupRes.ok) {
        toast.error('Could not find client in database');
        return;
      }
      const clients = await lookupRes.json();
      const dbClient = Array.isArray(clients)
        ? clients.find((c: { slug: string }) => c.slug === client.slug)
        : null;

      if (!dbClient) {
        toast.error('Client not found in database');
        return;
      }

      const res = await fetch(`/api/clients/${dbClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });

      if (!res.ok) {
        toast.error('Failed to remove client');
        return;
      }

      toast.success(`${client.name} removed`);
      onRemove(client.slug);
    } catch {
      toast.error('Something went wrong');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Link key={client.slug} href={`/admin/clients/${client.slug}`}>
      <Card interactive className={`animate-stagger-in flex items-start gap-3 group/card ${dimmed ? 'opacity-50' : ''}`} style={{ animationDelay: `${i * 50}ms` }}>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${dimmed ? 'bg-surface-hover text-text-muted' : 'bg-accent-surface text-accent-text'}`}>
          {client.abbreviation || <Building2 size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">{client.name}</p>
          <p className="text-xs text-text-muted">{client.industry || 'General'}</p>
          {client.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {client.services.map((service) => (
                <Badge key={service} variant={getServiceVariant(service)} className="text-[10px] px-1.5 py-0">
                  {service}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="cursor-pointer shrink-0 p-1.5 rounded-md opacity-0 group-hover/card:opacity-100 transition-opacity text-text-muted hover:text-red-400 hover:bg-red-400/10"
          title={`Remove ${client.name}`}
        >
          {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </Card>
    </Link>
  );
}

export function ClientSearchGrid({ clients: rawClients }: { clients: ClientItem[] }) {
  // Normalize services once on mount (memoized via stable reference)
  const clients = rawClients.map((c) => ({
    ...c,
    services: normalizeServices(c.services),
  }));

  const [query, setQuery] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const visible = clients.filter((c) => !removed.has(c.slug));

  const filtered = query.trim()
    ? visible.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.abbreviation && c.abbreviation.toLowerCase().includes(q)) ||
          c.industry.toLowerCase().includes(q) ||
          c.services.some((s) => s.toLowerCase().includes(q))
        );
      })
    : visible;

  const active = filtered.filter((c) => c.services.length > 0);
  const inactive = filtered.filter((c) => c.services.length === 0);

  function handleRemove(slug: string) {
    setRemoved((prev) => new Set(prev).add(slug));
  }

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
                <ClientCard key={client.slug} client={client} i={i} onRemove={handleRemove} />
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
                  <ClientCard key={client.slug} client={client} i={i} dimmed onRemove={handleRemove} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
