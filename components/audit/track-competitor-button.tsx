'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Activity, Check, Loader2, Search } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import type { CompetitorProfile } from '@/lib/audit/types';

interface MentionClient {
  id: string;
  name: string;
  avatarUrl?: string | null;
  logo_url?: string | null;
}

interface TrackCompetitorButtonProps {
  auditId: string;
  competitor: CompetitorProfile;
  /** Audit's pre-attached client (if any) — used to default-select in the picker. */
  defaultClientId?: string | null;
  /** Disabled when the competitor is a stub (we couldn't scrape baseline data). */
  disabled?: boolean;
}

/**
 * Per-card button that adds a single competitor to a client's benchmark
 * snapshot. Lazy-loads the client list on first open via /api/nerd/mentions
 * so cards stay cheap when the user never opens the popover.
 */
export function TrackCompetitorButton({
  auditId,
  competitor,
  defaultClientId = null,
  disabled = false,
}: TrackCompetitorButtonProps) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<MentionClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (!open || clients.length > 0) return;
    let cancelled = false;
    async function loadClients() {
      setClientsLoading(true);
      try {
        const r = await fetch('/api/nerd/mentions');
        const data: { clients?: MentionClient[] } = r.ok ? await r.json() : { clients: [] };
        if (!cancelled) setClients(data.clients ?? []);
      } catch {
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    }
    void loadClients();
    return () => {
      cancelled = true;
    };
  }, [open, clients.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...clients].sort((a, b) => {
      // Default-selected client floats to the top so the common case is one click.
      if (defaultClientId) {
        if (a.id === defaultClientId) return -1;
        if (b.id === defaultClientId) return 1;
      }
      return a.name.localeCompare(b.name);
    });
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query, defaultClientId]);

  async function handleTrack(clientId: string) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/benchmarks/track-competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          audit_id: auditId,
          competitor: {
            username: competitor.username,
            displayName: competitor.displayName,
            platform: competitor.platform,
            profileUrl: competitor.profileUrl,
            avatarUrl: competitor.avatarUrl ?? null,
            baselineFollowers: competitor.followers ?? null,
            baselineAvgViews: competitor.avgViews ?? null,
            baselineEngagementRate: competitor.engagementRate ?? null,
            baselinePostingFrequency: competitor.postingFrequency ?? null,
          },
        }),
      });
      const data: {
        error?: string;
        needs_baseline?: boolean;
        message?: string;
        action?: string;
      } = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needs_baseline) {
          toast.error(
            data.message ?? 'Run the Spy baseline for this brand before tracking competitors.',
            {
              action: { label: 'Open Spy', onClick: () => { window.location.href = '/spying'; } },
            },
          );
        } else {
          toast.error(data.error ?? 'Failed to track competitor');
        }
        return;
      }
      const clientName = clients.find((c) => c.id === clientId)?.name ?? 'client';
      if (data.action === 'already_tracked') {
        toast.info(`@${competitor.username} already tracked for ${clientName}`);
      } else {
        toast.success(`Added @${competitor.username} to ${clientName}'s competitor list`);
      }
      setTracked(true);
      setOpen(false);
    } catch {
      toast.error('Failed to track competitor');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={tracked ? 'Added to competitor list' : 'Add to competitor list'}
          title={
            disabled
              ? "Can't add — scrape data unavailable"
              : tracked
                ? 'Added'
                : 'Add to competitor list'
          }
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
            tracked
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
              : 'border-nativz-border bg-surface-hover/60 text-text-muted hover:border-accent/40 hover:bg-accent/10 hover:text-accent-text',
            disabled && 'cursor-not-allowed opacity-40 hover:border-nativz-border hover:bg-surface-hover/60 hover:text-text-muted',
          )}
        >
          {tracked ? <Check size={13} aria-hidden /> : <Activity size={13} aria-hidden />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        matchAnchorWidth={false}
        className="w-[min(20rem,calc(100vw-2rem))] border-nativz-border bg-surface p-0 text-text-primary shadow-[var(--shadow-dropdown)]"
      >
        <div className="border-b border-nativz-border p-3">
          <p className="text-xs font-medium text-text-muted">
            Add @{String(competitor.username).replace(/^@+/, '')} to…
          </p>
          <div className="relative mt-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="w-full rounded-lg border border-nativz-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-2" role="listbox" aria-label="Clients">
          {clientsLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-text-muted">
              {clients.length === 0 ? 'No accessible clients' : 'No matches'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((c) => {
                const isDefault = c.id === defaultClientId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isDefault}
                      onClick={() => void handleTrack(c.id)}
                      disabled={submitting}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover',
                        isDefault && 'bg-accent/5',
                        submitting && 'cursor-wait opacity-60',
                      )}
                    >
                      <ClientLogo
                        src={c.logo_url ?? c.avatarUrl ?? null}
                        name={c.name}
                        size="sm"
                        className="h-7 w-7 shrink-0 rounded-md"
                      />
                      <span className="min-w-0 flex-1 truncate text-text-primary">{c.name}</span>
                      {isDefault && (
                        <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-text">
                          attached
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-nativz-border px-3 py-2">
          <p className="text-[11px] text-text-muted">
            Appends to the brand&apos;s competitor list. Cron snapshots weekly.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
