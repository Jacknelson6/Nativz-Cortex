'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Plus, Loader2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';
import { formatRelativeTime } from '@/lib/utils/format';

type TrackerRow = {
  id: string;
  client_id: string;
  service: string;
  title: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  share_token?: string; // Present on the roster fetch? We don't display it here.
  clients: { name: string; slug: string; logo_url: string | null } | null;
};

type ClientOption = {
  id: string;
  name: string;
  slug: string;
  services: string[];
};

const STATUS_VARIANTS: Record<string, { label: string; variant: 'success' | 'warning' | 'info' | 'default' }> = {
  active:    { label: 'Active',    variant: 'info' },
  paused:    { label: 'Paused',    variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  archived:  { label: 'Archived',  variant: 'default' },
};

/**
 * Roster table for /admin/onboarding. Shows every tracker with a quick
 * client + service + status scan, with inline "New tracker" creation
 * (pick client + service from dropdowns) and deep links to the editor.
 */
export function OnboardingRosterTable({
  trackers,
  clients,
}: {
  trackers: TrackerRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trackers;
    return trackers.filter((t) => {
      const cname = t.clients?.name?.toLowerCase() ?? '';
      return (
        cname.includes(q) ||
        t.service.toLowerCase().includes(q) ||
        (t.title ?? '').toLowerCase().includes(q)
      );
    });
  }, [trackers, query]);

  async function handleCreate(clientId: string, service: string) {
    if (!clientId || !service) return;
    setCreating(true);
    try {
      const res = await fetch('/api/onboarding/trackers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, service }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error || 'Failed to create tracker');
        return;
      }
      const { tracker } = await res.json() as { tracker: { id: string } };
      toast.success('Tracker created');
      router.push(`/admin/onboarding/${tracker.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trackers..."
            className="w-full rounded-lg border border-nativz-border bg-surface-primary pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-border focus:outline-none focus:ring-1 focus:ring-accent-border transition-colors"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowNew((v) => !v)}
        >
          <Plus size={14} />
          {showNew ? 'Close' : 'New tracker'}
        </Button>
      </div>

      {showNew && (
        <NewTrackerForm clients={clients} creating={creating} onCreate={handleCreate} />
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-[10px] border border-dashed border-nativz-border/60">
          <Search size={28} className="text-text-muted/60 mb-3" />
          <p className="text-sm text-text-secondary">
            {trackers.length === 0 ? 'No onboarding trackers yet.' : 'No trackers match your search.'}
          </p>
          {trackers.length === 0 && (
            <p className="text-xs text-text-muted mt-1">Click &ldquo;New tracker&rdquo; to start one.</p>
          )}
        </div>
      ) : (
        <div className="rounded-[10px] border border-nativz-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nativz-border bg-surface-hover/30">
                  <Th>Client</Th>
                  <Th>Service</Th>
                  <Th>Status</Th>
                  <Th>Started</Th>
                  <Th>Updated</Th>
                  <Th className="text-right pr-4">{''}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const status = STATUS_VARIANTS[t.status] ?? STATUS_VARIANTS.active;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => router.push(`/admin/onboarding/${t.id}`)}
                      className="border-b border-nativz-border last:border-b-0 hover:bg-surface-hover/20 cursor-pointer transition-colors"
                    >
                      <Td>
                        <div className="flex items-center gap-3">
                          <ClientLogo
                            src={t.clients?.logo_url ?? null}
                            name={t.clients?.name ?? ''}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-text-primary truncate">
                              {t.clients?.name ?? 'Unknown'}
                            </p>
                            {t.title && (
                              <p className="text-[12px] text-text-muted truncate">{t.title}</p>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Badge variant="default">{t.service}</Badge>
                      </Td>
                      <Td>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </Td>
                      <Td>
                        <span className="text-[12px] text-text-muted tabular-nums">
                          {t.started_at ? formatRelativeTime(t.started_at) : '—'}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[12px] text-text-muted tabular-nums">
                          {formatRelativeTime(t.created_at)}
                        </span>
                      </Td>
                      <Td className="text-right pr-4">
                        <ArrowRight size={14} className="inline text-text-muted" />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New tracker inline form ─────────────────────────────────────────────

function NewTrackerForm({
  clients,
  creating,
  onCreate,
}: {
  clients: ClientOption[];
  creating: boolean;
  onCreate: (clientId: string, service: string) => Promise<void>;
}) {
  const [clientId, setClientId] = useState('');
  const [service, setService] = useState('');

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  );
  // Offer the client's contracted services first; fall back to canonical 4.
  const serviceOptions = useMemo(() => {
    const canonical = ['SMM', 'Paid Media', 'Editing', 'Affiliates'];
    const contracted = selectedClient?.services ?? [];
    const merged = Array.from(new Set([...contracted, ...canonical]));
    return merged;
  }, [selectedClient]);

  return (
    <div className="rounded-[10px] border border-nativz-border bg-surface p-4 space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">New onboarding tracker</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Client
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer"
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Service
          </label>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            disabled={!clientId}
            className="w-full rounded-lg border border-nativz-border bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-accent-border focus:outline-none cursor-pointer disabled:opacity-50"
          >
            <option value="">Select a service…</option>
            {serviceOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={() => void onCreate(clientId, service)}
          disabled={!clientId || !service || creating}
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Create
        </Button>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className ?? ''}`}>{children}</td>;
}
