'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Users2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface MentionClient {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface AttachToClientDialogProps {
  open: boolean;
  onClose: () => void;
  auditId: string;
}

type Cadence = 'weekly' | 'biweekly' | 'monthly';
type AnalyticsSource = 'auto' | 'scrape' | 'client_analytics';

/**
 * Admin-only. Attaches a completed Analyze Social audit to a client so the
 * Phase 2 cron can scrape the audit's competitor list on a recurring
 * schedule. Matches the Topic Search "Send to Strategy Lab" pattern —
 * modal, client picker, confirm.
 */
export function AttachToClientDialog({ open, onClose, auditId }: AttachToClientDialogProps) {
  const [clients, setClients] = useState<MentionClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [analyticsSource, setAnalyticsSource] = useState<AnalyticsSource>('auto');
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Reuse the mentions endpoint — it's the same "all admin-accessible
  // clients with avatar URLs" shape the Nerd picker already consumes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setClientsLoading(true);
    fetch('/api/nerd/mentions')
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((data: { clients?: MentionClient[] }) => {
        if (cancelled) return;
        setClients(data.clients ?? []);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, clientQuery]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  async function handleAttach() {
    if (!selectedClientId) return;
    // Date range validation — both empty is fine, both set must be ordered.
    if (dateStart && dateEnd && dateStart > dateEnd) {
      toast.error('Date range: start is after end');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/analyze-social/${auditId}/attach-to-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selectedClientId,
          cadence,
          analyticsSource,
          dateRangeStart: dateStart || null,
          dateRangeEnd: dateEnd || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to attach audit');
        return;
      }
      toast.success(
        `Attached to ${selectedClient?.name ?? 'client'} — ${data.competitorsCount ?? 0} competitor${
          data.competitorsCount === 1 ? '' : 's'
        } tracked`,
      );
      onClose();
    } catch {
      toast.error('Failed to attach audit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Attach to client" maxWidth="lg">
      <div className="space-y-5">
        <p className="text-sm text-text-muted">
          Pick a client to benchmark against this audit. We&apos;ll track the
          competitors listed here on a recurring schedule so you can compare
          their growth to the client&apos;s in the analytics dashboard.
        </p>

        {/* Client picker */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Client
          </label>
          <input
            type="text"
            value={clientQuery}
            onChange={(e) => setClientQuery(e.target.value)}
            placeholder="Search clients..."
            className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50"
          />
          <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-nativz-border">
            {clientsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
                <Loader2 size={14} className="animate-spin" />
                Loading clients...
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-muted">
                {clients.length === 0 ? 'No accessible clients' : 'No matches'}
              </div>
            ) : (
              <ul>
                {filteredClients.map((c) => {
                  const picked = c.id === selectedClientId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedClientId(c.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                          picked
                            ? 'bg-accent-surface text-text-primary'
                            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                        )}
                      >
                        {c.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.avatarUrl}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-hover text-[11px] text-text-muted">
                            {c.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">{c.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Optional date range — filters which posts count toward the
            baseline (Phase 2 cron uses this as the anchor point). */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Date range <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
            />
            <span className="text-text-muted">—</span>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="flex-1 rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>

        {/* Advanced settings — cadence + analytics source. Folded by
            default so the common attach flow stays one click. */}
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronDown
              size={14}
              className={cn('transition-transform', advancedOpen && 'rotate-180')}
            />
            Advanced settings
          </button>

          {advancedOpen && (
            <div className="mt-3 space-y-4 rounded-lg border border-nativz-border bg-surface/40 p-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Snapshot cadence
                </label>
                <div className="inline-flex rounded-lg border border-nativz-border p-0.5">
                  {(['weekly', 'biweekly', 'monthly'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCadence(v)}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                        cadence === v
                          ? 'bg-accent text-white'
                          : 'text-text-muted hover:text-text-secondary',
                      )}
                    >
                      {v === 'weekly' ? 'Weekly' : v === 'biweekly' ? 'Bi-weekly' : 'Monthly'}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-text-muted/80">
                  How often the cron re-scrapes this audit&apos;s competitors.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Analytics source
                </label>
                <select
                  value={analyticsSource}
                  onChange={(e) => setAnalyticsSource(e.target.value as AnalyticsSource)}
                  className="w-full rounded-lg border border-nativz-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
                >
                  <option value="auto">Auto — prefer client analytics, fall back to scrape</option>
                  <option value="scrape">Scrape only (ignore client analytics)</option>
                  <option value="client_analytics">Client analytics only (no scraping)</option>
                </select>
                <p className="mt-1.5 text-xs text-text-muted/80">
                  If the client has a real analytics feed wired up, we prefer that —
                  scraping is the fallback.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-nativz-border/50 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleAttach()} disabled={!selectedClientId || submitting}>
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Attaching...
              </>
            ) : (
              <>
                <Users2 size={14} /> Attach to client
              </>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
